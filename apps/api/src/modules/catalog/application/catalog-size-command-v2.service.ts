import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type SizeCommandOutcome =
    | { kind: "created" | "updated"; id: EntityId }
    | { kind: "deleted" | "size_not_found" | "size_name_conflict" | "size_in_use" };

export interface CatalogSizeCommandV2Repository {
    create: (name: string) => Promise<SizeCommandOutcome>;
    update: (id: EntityId, name: string) => Promise<SizeCommandOutcome>;
    remove: (id: EntityId) => Promise<SizeCommandOutcome>;
}

export type SizeCommandResult = SizeCommandOutcome
    | { kind: "forbidden" | "invalid_size_input" | "catalog_unavailable" };

const parseName = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 100
        ? value.trim() : null;
const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Shared size reference; stock ownership stays with product variants/inventory. */
export class CatalogSizeCommandV2Service {
    constructor(private readonly dependencies: { repository: CatalogSizeCommandV2Repository }) {}

    async create(context: V2AccessContext, nameInput: unknown): Promise<SizeCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const name = parseName(nameInput);
        if (!name) return { kind: "invalid_size_input" };
        try { return await this.dependencies.repository.create(name); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, idInput: unknown, nameInput: unknown): Promise<SizeCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        const name = parseName(nameInput);
        if (!id || !name) return { kind: "invalid_size_input" };
        try { return await this.dependencies.repository.update(id, name); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async remove(context: V2AccessContext, idInput: unknown): Promise<SizeCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_size_input" };
        try { return await this.dependencies.repository.remove(id); }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
