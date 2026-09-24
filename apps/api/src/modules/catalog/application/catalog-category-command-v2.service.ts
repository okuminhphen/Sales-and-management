import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type CategoryCreateV2 = { name: string; description?: string | null; parentId?: string | null };
export type CategoryPatchV2 = { name?: string; description?: string | null; parentId?: string | null };
export type CategoryWriteV2 = { name: string; description: string | null; parentId: EntityId | null };
export type CategoryChangeV2 = Partial<CategoryWriteV2>;

export type CategoryCommandOutcome =
    | { kind: "created" | "updated"; id: EntityId }
    | { kind: "deleted" }
    | { kind: "category_not_found" | "parent_not_found" | "category_cycle" | "category_in_use" };

export interface CatalogCategoryCommandV2Repository {
    create: (input: CategoryWriteV2) => Promise<CategoryCommandOutcome>;
    update: (id: EntityId, patch: CategoryChangeV2) => Promise<CategoryCommandOutcome>;
    remove: (id: EntityId) => Promise<CategoryCommandOutcome>;
}

export type CategoryCommandResult = CategoryCommandOutcome
    | { kind: "forbidden" | "invalid_category_input" | "catalog_unavailable" };

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};
const parseName = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 255
        ? value.trim() : null;
const parseDescription = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === "string" && value.length <= 5000 ? value : undefined;
};
const parseParent = (value: unknown): EntityId | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return parseId(value) ?? undefined;
};

/** Catalog writes require an internal global grant; category code/slug are immutable. */
export class CatalogCategoryCommandV2Service {
    constructor(private readonly dependencies: { repository: CatalogCategoryCommandV2Repository }) {}

    async create(context: V2AccessContext, input: CategoryCreateV2): Promise<CategoryCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const name = parseName(input.name);
        const description = parseDescription(input.description);
        const parentId = parseParent(input.parentId);
        if (!name || description === undefined && input.description !== undefined || parentId === undefined && input.parentId !== undefined) {
            return { kind: "invalid_category_input" };
        }
        try { return await this.dependencies.repository.create({ name, description: description ?? null, parentId: parentId ?? null }); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, idInput: unknown, input: CategoryPatchV2): Promise<CategoryCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        const name = input.name === undefined ? undefined : parseName(input.name);
        const description = parseDescription(input.description);
        const parentId = parseParent(input.parentId);
        if (!id || name === null || description === undefined && input.description !== undefined
            || parentId === undefined && input.parentId !== undefined
            || Object.keys(input).length === 0) return { kind: "invalid_category_input" };
        const patch: CategoryChangeV2 = {
            ...(name === undefined ? {} : { name }),
            ...(input.description === undefined ? {} : { description: description ?? null }),
            ...(input.parentId === undefined ? {} : { parentId: parentId ?? null }),
        };
        try { return await this.dependencies.repository.update(id, patch); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async remove(context: V2AccessContext, idInput: unknown): Promise<CategoryCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_category_input" };
        try { return await this.dependencies.repository.remove(id); }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
