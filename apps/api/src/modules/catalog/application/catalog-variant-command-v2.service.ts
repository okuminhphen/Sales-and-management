import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type VariantStatusV2 = "draft" | "active" | "inactive";
export type VariantCreateV2 = { sizeId: EntityId; sku: string; status: VariantStatusV2 };
export type VariantPatchV2 = { sku?: string; status?: VariantStatusV2 };
export type VariantCommandOutcome =
    | { kind: "created" | "updated"; id: EntityId }
    | { kind: "deactivated" | "product_not_found" | "size_not_found" | "variant_not_found" | "variant_conflict" };
export interface CatalogVariantCommandV2Repository {
    create: (productId: EntityId, input: VariantCreateV2) => Promise<VariantCommandOutcome>;
    update: (productId: EntityId, variantId: EntityId, patch: VariantPatchV2) => Promise<VariantCommandOutcome>;
    deactivate: (productId: EntityId, variantId: EntityId) => Promise<VariantCommandOutcome>;
}
export type VariantCommandResult = VariantCommandOutcome
    | { kind: "forbidden" | "invalid_variant_input" | "catalog_unavailable" };

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};
const parseSku = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 100
        ? value.trim() : null;

/** Variant identity and SKU only; stock is never accepted at this boundary. */
export class CatalogVariantCommandV2Service {
    constructor(private readonly dependencies: { repository: CatalogVariantCommandV2Repository }) {}

    async create(context: V2AccessContext, productIdInput: unknown,
        input: { sizeId: string; sku: string; status?: VariantStatusV2 }): Promise<VariantCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const productId = parseId(productIdInput);
        const sizeId = parseId(input.sizeId);
        const sku = parseSku(input.sku);
        if (!productId || !sizeId || !sku) return { kind: "invalid_variant_input" };
        try { return await this.dependencies.repository.create(productId, { sizeId, sku, status: input.status ?? "active" }); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, productIdInput: unknown, variantIdInput: unknown,
        input: VariantPatchV2): Promise<VariantCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const productId = parseId(productIdInput);
        const variantId = parseId(variantIdInput);
        const sku = input.sku === undefined ? undefined : parseSku(input.sku);
        if (!productId || !variantId || Object.keys(input).length === 0 || sku === null) {
            return { kind: "invalid_variant_input" };
        }
        try { return await this.dependencies.repository.update(productId, variantId, {
            ...(sku === undefined ? {} : { sku }),
            ...(input.status === undefined ? {} : { status: input.status }),
        }); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async deactivate(context: V2AccessContext, productIdInput: unknown, variantIdInput: unknown): Promise<VariantCommandResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const productId = parseId(productIdInput);
        const variantId = parseId(variantIdInput);
        if (!productId || !variantId) return { kind: "invalid_variant_input" };
        try { return await this.dependencies.repository.deactivate(productId, variantId); }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
