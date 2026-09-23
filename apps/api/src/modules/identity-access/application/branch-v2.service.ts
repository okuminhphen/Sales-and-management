import {
    serializeEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import { hasGlobalPermission, type V2AccessContext } from "./access-context.js";

export type BranchProfile = {
    id: EntityId;
    code: string;
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    type: "central" | "branch";
    managerEmployeeId: EntityId | null;
};

export type CreateBranchInput = {
    code: string;
    name: string;
    address: string;
    phone?: string | null;
    email?: string | null;
    type?: "central" | "branch";
};

export type UpdateBranchInput = {
    name?: string;
    address?: string;
    phone?: string | null;
    email?: string | null;
    type?: "central" | "branch";
};

export type NewBranch = {
    code: string;
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    type: "central" | "branch";
};

export type BranchPatch = Omit<Partial<NewBranch>, "code">;

export type BranchListInput = {
    page?: unknown;
    limit?: unknown;
};

export type BranchListQuery = {
    page: number;
    limit: number;
};

export type BranchPage = {
    branches: readonly BranchProfile[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

export type BranchMutationResult =
    | BranchProfile
    | { kind: "branch_not_found" }
    | { kind: "branch_code_conflict" };

/** Persistence port for the branch aggregate. Manager assignment is a separate use-case. */
export interface BranchV2Repository {
    findById: (branchId: EntityId) => Promise<BranchProfile | null>;
    listBranches: (query: BranchListQuery) => Promise<BranchPage>;
    createBranch: (input: NewBranch) => Promise<BranchMutationResult>;
    updateBranch: (branchId: EntityId, patch: BranchPatch) => Promise<BranchMutationResult>;
}

export type BranchResult =
    | { kind: "forbidden" }
    | { kind: "invalid_branch_input" }
    | { kind: "branches"; page: BranchPage }
    | { kind: "branch"; branch: BranchProfile }
    | { kind: "created"; branch: BranchProfile }
    | { kind: "updated"; branch: BranchProfile }
    | { kind: "branch_not_found" }
    | { kind: "branch_code_conflict" }
    | { kind: "branch_unavailable" };

const branchCodePattern = /^[A-Z][A-Z0-9_-]{2,49}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const branchReadPermission = "branch.read";
const branchManagePermission = "branch.manage.global";
const defaultPage = 1;
const defaultLimit = 20;
const maximumLimit = 100;

const normalizeText = (value: unknown, maximumLength: number): string | undefined =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength
        ? value.trim()
        : undefined;

const normalizeNullableText = (
    value: unknown,
    maximumLength: number,
): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return normalizeText(value, maximumLength);
};

const normalizeEmail = (value: unknown): string | null | undefined => {
    const normalized = normalizeNullableText(value, 255);
    if (normalized === null || normalized === undefined) return normalized;
    const email = normalized.toLowerCase();
    return emailPattern.test(email) ? email : undefined;
};

const normalizeType = (value: unknown): "central" | "branch" | undefined =>
    value === "central" || value === "branch" ? value : undefined;

const parseEntityId = (value: unknown): EntityId | null => {
    try {
        return serializeEntityId(value);
    } catch {
        return null;
    }
};

const normalizeListQuery = (input: BranchListInput | undefined): BranchListQuery | null => {
    const page = input?.page === undefined ? defaultPage : input.page;
    const limit = input?.limit === undefined ? defaultLimit : input.limit;
    if (
        typeof page !== "number" || typeof limit !== "number"
        || !Number.isInteger(page) || !Number.isInteger(limit)
        || page <= 0 || limit <= 0 || limit > maximumLimit
    ) {
        return null;
    }
    return { page, limit };
};

const isBranch = (result: BranchMutationResult): result is BranchProfile => "id" in result;

/**
 * Branch directory and configuration policy. Branch codes, manager assignment,
 * deletion and inventory initialization are intentionally excluded: they each
 * alter referential/audit behavior and require dedicated use-cases.
 */
export class BranchV2Service {
    constructor(private readonly dependencies: { repository: BranchV2Repository }) {}

    async list(context: V2AccessContext, input?: BranchListInput): Promise<BranchResult> {
        if (!this.canReadBranches(context)) return { kind: "forbidden" };
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_branch_input" };
        try {
            return { kind: "branches", page: await this.dependencies.repository.listBranches(query) };
        } catch {
            return { kind: "branch_unavailable" };
        }
    }

    async get(context: V2AccessContext, rawBranchId: string): Promise<BranchResult> {
        const branchId = parseEntityId(rawBranchId);
        if (!branchId) return { kind: "invalid_branch_input" };
        if (!this.canReadBranches(context)) return { kind: "forbidden" };
        try {
            const branch = await this.dependencies.repository.findById(branchId);
            return branch ? { kind: "branch", branch } : { kind: "branch_not_found" };
        } catch {
            return { kind: "branch_unavailable" };
        }
    }

    async create(context: V2AccessContext, input: CreateBranchInput): Promise<BranchResult> {
        if (!hasGlobalPermission(context, branchManagePermission)) return { kind: "forbidden" };
        const branch = this.normalizeNewBranch(input);
        if (!branch) return { kind: "invalid_branch_input" };
        return this.mapMutation(() => this.dependencies.repository.createBranch(branch), "created");
    }

    async update(
        context: V2AccessContext,
        rawBranchId: string,
        input: UpdateBranchInput,
    ): Promise<BranchResult> {
        if (!hasGlobalPermission(context, branchManagePermission)) return { kind: "forbidden" };
        const branchId = parseEntityId(rawBranchId);
        const patch = this.normalizePatch(input);
        if (!branchId || !patch) return { kind: "invalid_branch_input" };
        return this.mapMutation(() => this.dependencies.repository.updateBranch(branchId, patch), "updated");
    }

    private canReadBranches(context: V2AccessContext): boolean {
        return context.grants.some(
            (grant) => grant.roleCode !== "CUSTOMER" && grant.permissions.includes(branchReadPermission),
        );
    }

    private normalizeNewBranch(input: CreateBranchInput): NewBranch | null {
        const code = typeof input.code === "string" ? input.code.trim() : "";
        const name = normalizeText(input.name, 255);
        const address = normalizeText(input.address, 500);
        const phone = input.phone === undefined ? null : normalizeNullableText(input.phone, 30);
        const email = input.email === undefined ? null : normalizeEmail(input.email);
        const type = input.type === undefined ? "branch" : normalizeType(input.type);
        if (!branchCodePattern.test(code) || !name || !address || phone === undefined || email === undefined || !type) {
            return null;
        }
        return { code, name, address, phone, email, type };
    }

    private normalizePatch(input: UpdateBranchInput): BranchPatch | null {
        const name = input.name === undefined ? undefined : normalizeText(input.name, 255);
        const address = input.address === undefined ? undefined : normalizeText(input.address, 500);
        const phone = normalizeNullableText(input.phone, 30);
        const email = normalizeEmail(input.email);
        const type = input.type === undefined ? undefined : normalizeType(input.type);
        if (
            name === undefined && input.name !== undefined
            || address === undefined && input.address !== undefined
            || phone === undefined && input.phone !== undefined
            || email === undefined && input.email !== undefined
            || type === undefined && input.type !== undefined
        ) return null;
        if (name === undefined && address === undefined && phone === undefined && email === undefined && type === undefined) {
            return null;
        }
        return {
            ...(name === undefined ? {} : { name }),
            ...(address === undefined ? {} : { address }),
            ...(phone === undefined ? {} : { phone }),
            ...(email === undefined ? {} : { email }),
            ...(type === undefined ? {} : { type }),
        };
    }

    private async mapMutation(
        mutate: () => Promise<BranchMutationResult>,
        success: "created" | "updated",
    ): Promise<BranchResult> {
        try {
            const result = await mutate();
            if (!isBranch(result)) return result;
            return success === "created"
                ? { kind: "created", branch: result }
                : { kind: "updated", branch: result };
        } catch {
            return { kind: "branch_unavailable" };
        }
    }
}
