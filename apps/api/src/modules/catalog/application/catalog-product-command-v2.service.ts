import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, serializeMoney, type EntityId, type Money } from "../../../shared/contracts/database-scalars.js";

export type ProductMetadataV2 = {
    name: string;
    description: string | null;
    basePrice: Money;
    categoryId: EntityId;
    status: "draft" | "active" | "inactive";
};
export type ProductMetadataPatchV2 = Partial<ProductMetadataV2>;
export type ProductCreateInputV2 = { name: string; description?: string | null; price: string; categoryId: string };
export type ProductUpdateInputV2 = {
    name?: string; description?: string | null; price?: string; categoryId?: string;
    status?: "draft" | "active" | "inactive";
};
export type ProductCommandOutcome =
    | { kind: "created" | "updated"; id: EntityId }
    | { kind: "deactivated" | "product_not_found" | "category_not_found" };
export interface CatalogProductCommandV2Repository {
    create: (input: ProductMetadataV2) => Promise<ProductCommandOutcome>;
    update: (id: EntityId, patch: ProductMetadataPatchV2) => Promise<ProductCommandOutcome>;
    deactivate: (id: EntityId) => Promise<ProductCommandOutcome>;
}
export type ProductCommandResult = ProductCommandOutcome
    | { kind: "forbidden" | "invalid_product_input" | "catalog_unavailable" };

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};
const parsePrice = (value: unknown): Money | null => {
    try { return serializeMoney(value); } catch { return null; }
};
const validName = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 255;
const validDescription = (value: unknown): value is string | null =>
    value === null || typeof value === "string" && value.length <= 5000;

/** Metadata-only product commands. Media and variant lifecycles are separate capabilities. */
export class CatalogProductCommandV2Service {
    constructor(private readonly dependencies: { repository: CatalogProductCommandV2Repository }) {}

    async create(context: V2AccessContext, input: ProductCreateInputV2): Promise<ProductCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const categoryId = parseId(input.categoryId);
        const basePrice = parsePrice(input.price);
        if (!validName(input.name) || !categoryId || !basePrice
            || input.description !== undefined && !validDescription(input.description)) {
            return { kind: "invalid_product_input" };
        }
        try {
            return await this.dependencies.repository.create({
                name: input.name.trim(), description: input.description ?? null,
                basePrice, categoryId, status: "draft",
            });
        } catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, idInput: unknown, input: ProductUpdateInputV2): Promise<ProductCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        const categoryId = input.categoryId === undefined ? undefined : parseId(input.categoryId);
        const basePrice = input.price === undefined ? undefined : parsePrice(input.price);
        if (!id || Object.keys(input).length === 0 || input.name !== undefined && !validName(input.name)
            || input.description !== undefined && !validDescription(input.description)
            || categoryId === null || basePrice === null) return { kind: "invalid_product_input" };
        const patch: ProductMetadataPatchV2 = {
            ...(input.name === undefined ? {} : { name: input.name.trim() }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(basePrice === undefined ? {} : { basePrice }),
            ...(categoryId === undefined ? {} : { categoryId }),
            ...(input.status === undefined ? {} : { status: input.status }),
        };
        try { return await this.dependencies.repository.update(id, patch); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async deactivate(context: V2AccessContext, idInput: unknown): Promise<ProductCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_product_input" };
        try { return await this.dependencies.repository.deactivate(id); }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
