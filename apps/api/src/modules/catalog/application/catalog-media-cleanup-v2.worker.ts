import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import { isOwnedBannerAsset, type CatalogMediaProvider } from "./catalog-media-provider.js";

export type CatalogMediaCleanupJob = {
    id: EntityId;
    publicId: string;
    kind: "upload_reserved" | "cleanup_requested";
    attempts: number;
};

export interface CatalogMediaCleanupV2Repository {
    claimNext: () => Promise<CatalogMediaCleanupJob | null>;
    isReferenced: (publicId: string) => Promise<boolean>;
    markCompleted: (id: EntityId) => Promise<void>;
    markFailed: (id: EntityId, error: string) => Promise<void>;
}

/** Processes only banner-media jobs; Cloudinary deletion is idempotent on retry. */
export class CatalogMediaCleanupV2Worker {
    constructor(private readonly dependencies: {
        repository: CatalogMediaCleanupV2Repository;
        mediaProvider: CatalogMediaProvider;
    }) {}

    async runOnce(): Promise<boolean> {
        const job = await this.dependencies.repository.claimNext();
        if (!job) return false;

        try {
            if (!isOwnedBannerAsset(job.publicId)) {
                await this.dependencies.repository.markFailed(job.id, "invalid_public_id");
                return true;
            }
            if (await this.dependencies.repository.isReferenced(job.publicId)) {
                await this.dependencies.repository.markCompleted(job.id);
                return true;
            }
            const result = await this.dependencies.mediaProvider.delete(job.publicId);
            if (result.kind === "deleted" || result.kind === "not_found") {
                await this.dependencies.repository.markCompleted(job.id);
            } else {
                await this.dependencies.repository.markFailed(job.id, "provider_error");
            }
        } catch {
            // A failed DB acknowledgement leaves the lease to expire for an idempotent retry.
            await this.dependencies.repository.markFailed(job.id, "cleanup_exception");
        }
        return true;
    }
}
