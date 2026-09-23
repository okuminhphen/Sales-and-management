import { describe, expect, it, vi } from "vitest";
import {
    EmployeeV2Service,
    type EmployeeProfile,
    type EmployeeV2Repository,
} from "../../src/modules/identity-access/application/employee-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import {
    serializeEntityId,
    serializeMoney,
} from "../../src/shared/contracts/database-scalars.js";

const branchId = serializeEntityId("9007199254740994");
const employee: EmployeeProfile = {
    id: serializeEntityId("9007199254740995"),
    accountId: null,
    branchId,
    code: "EMP_ANALYTICS",
    fullName: "Nguyễn Văn Employee",
    position: "Analytics",
    phone: "0912345678",
    email: "employee@example.test",
    salary: serializeMoney("10000000.0000"),
    status: "active",
    hiredAt: null,
};

const globalManager: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: null,
    employeeId: null,
    grants: [{
        roleCode: "SUPER_ADMIN",
        scope: { type: "global" },
        permissions: ["employee.read.branch", "employee.manage.global"],
    }],
};

const createRepository = (): EmployeeV2Repository => ({
    findById: vi.fn(async () => employee),
    listByBranch: vi.fn(async () => [employee]),
    createEmployee: vi.fn(async () => employee),
    updateEmployee: vi.fn(async () => employee),
    deactivateEmployee: vi.fn(async () => employee),
});

describe("EmployeeV2Service", () => {
    it("allows a branch manager to manage employees only at their assigned branch", async () => {
        const repository = createRepository();
        const service = new EmployeeV2Service({ repository });
        const branchManager: V2AccessContext = {
            ...globalManager,
            grants: [{
                roleCode: "BRANCH_MANAGER",
                scope: { type: "branch", branchId },
                permissions: ["employee.read.branch", "employee.manage.branch"],
            }],
        };

        await expect(service.listByBranch(branchManager, branchId)).resolves.toEqual({
            kind: "employees",
            employees: [employee],
        });
        vi.mocked(repository.findById).mockResolvedValueOnce({
            ...employee,
            branchId: serializeEntityId("9007199254740996"),
        });
        await expect(service.deactivate(branchManager, "9007199254740996")).resolves.toEqual({
            kind: "forbidden",
        });
        expect(repository.deactivateEmployee).not.toHaveBeenCalled();
    });

    it("normalizes a new employee without permitting a client-supplied status", async () => {
        const repository = createRepository();
        const service = new EmployeeV2Service({ repository });

        await expect(service.create(globalManager, {
            branchId,
            code: "EMP_ANALYTICS",
            fullName: "  Nguyễn Văn Employee ",
            position: "  Analytics ",
            phone: " 0912345678 ",
            email: " EMPLOYEE@EXAMPLE.TEST ",
            salary: "10000000",
        })).resolves.toEqual({ kind: "created", employee });
        expect(repository.createEmployee).toHaveBeenCalledWith({
            branchId,
            accountId: null,
            code: "EMP_ANALYTICS",
            fullName: "Nguyễn Văn Employee",
            position: "Analytics",
            phone: "0912345678",
            email: "employee@example.test",
            salary: "10000000.0000",
            hiredAt: null,
        });
    });

    it("rejects invalid updates and never hard-deletes an employee record", async () => {
        const repository = createRepository();
        const service = new EmployeeV2Service({ repository });

        await expect(service.update(globalManager, employee.id, { fullName: "  " }))
            .resolves.toEqual({ kind: "invalid_employee_input" });
        await expect(service.deactivate(globalManager, employee.id)).resolves.toEqual({
            kind: "deactivated",
            employee,
        });
        expect(repository.updateEmployee).not.toHaveBeenCalled();
        expect(repository.deactivateEmployee).toHaveBeenCalledWith(employee.id);
    });
});
