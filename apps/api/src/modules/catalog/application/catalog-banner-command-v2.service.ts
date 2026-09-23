import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { canManageBanners } from "./catalog-banner-policy.js";
import { toCatalogPublicTargetUrl } from "./catalog-public-media.js";

export type BannerStatus = "draft" | "active" | "inactive";
export type BannerMetadata = { name: string; targetUrl: string | null; status: BannerStatus };
export type BannerMetadataPatch = Partial<BannerMetadata>;
export type BannerCommandOutcome =
    | { kind: "created"; bannerId: EntityId }
    | { kind: "updated" }
    | { kind: "deleted" }
    | { kind: "banner_not_found" }
    | { kind: "media_cleanup_required" };
export type BannerCommandResult = BannerCommandOutcome
    | { kind: "forbidden" }
    | { kind: "invalid_banner" }
    | { kind: "catalog_unavailable" };

/** Only metadata may be mutated until the media lifecycle has a durable cleanup path. */
export interface CatalogBannerCommandV2Repository {
    create: (metadata: BannerMetadata) => Promise<{ kind: "created"; bannerId: EntityId }>;
    update: (id: EntityId, patch: BannerMetadataPatch) => Promise<
        { kind: "updated" } | { kind: "banner_not_found" }
    >;
    deleteWithoutMedia: (id: EntityId) => Promise<
        { kind: "deleted" } | { kind: "banner_not_found" } | { kind: "media_cleanup_required" }
    >;
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === "object" && input !== null && !Array.isArray(input);

const normalizeName = (input: unknown): string | undefined => {
    if (typeof input !== "string") return undefined;
    const name = input.trim();
    return name.length >= 1 && name.length <= 255 ? name : undefined;
};

const normalizeStatus = (input: unknown): BannerStatus | undefined =>
    input === "draft" || input === "active" || input === "inactive" ? input : undefined;

const normalizeTargetUrl = (input: unknown): string | null | undefined => {
    if (input === null || input === "") return null;
    if (typeof input !== "string") return undefined;
    const targetUrl = input.trim();
    if (!targetUrl) return null;
    return targetUrl.length <= 1000 ? toCatalogPublicTargetUrl(targetUrl) ?? undefined : undefined;
};

const acceptedKeys = new Set(["name", "targetUrl", "status"]);
const hasOnlyMetadata = (input: Record<string, unknown>): boolean =>
    Object.keys(input).every((key) => acceptedKeys.has(key));

const normalizeCreate = (input: unknown): BannerMetadata | null => {
    if (!isRecord(input) || !hasOnlyMetadata(input)) return null;
    const name = normalizeName(input.name);
    const status = input.status === undefined ? "draft" : normalizeStatus(input.status);
    const targetUrl = input.targetUrl === undefined ? null : normalizeTargetUrl(input.targetUrl);
    if (!name || !status || targetUrl === undefined) return null;
    return { name, status, targetUrl };
};

const normalizePatch = (input: unknown): BannerMetadataPatch | null => {
    if (!isRecord(input) || !hasOnlyMetadata(input) || Object.keys(input).length === 0) return null;
    const patch: BannerMetadataPatch = {};
    if ("name" in input) {
        const name = normalizeName(input.name);
        if (!name) return null;
        patch.name = name;
    }
    if ("status" in input) {
        const status = normalizeStatus(input.status);
        if (!status) return null;
        patch.status = status;
    }
    if ("targetUrl" in input) {
        const targetUrl = normalizeTargetUrl(input.targetUrl);
        if (targetUrl === undefined) return null;
        patch.targetUrl = targetUrl;
    }
    return patch;
};

const parseId = (input: unknown): EntityId | null => {
    try { return serializeEntityId(input); } catch { return null; }
};

export class CatalogBannerCommandV2Service {
    constructor(private readonly dependencies: { repository: CatalogBannerCommandV2Repository }) {}

    async create(context: V2AccessContext, input: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const metadata = normalizeCreate(input);
        if (!metadata) return { kind: "invalid_banner" };
        try { return await this.dependencies.repository.create(metadata); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, idInput: unknown, input: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        const patch = normalizePatch(input);
        if (!id || !patch) return { kind: "invalid_banner" };
        try { return await this.dependencies.repository.update(id, patch); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async delete(context: V2AccessContext, idInput: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_banner" };
        try { return await this.dependencies.repository.deleteWithoutMedia(id); }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
