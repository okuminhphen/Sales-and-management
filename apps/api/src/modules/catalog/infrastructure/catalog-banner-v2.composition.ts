import type { V2Persistence } from "../../../database/v2/persistence.js";
import { CatalogBannerCommandV2Service } from "../application/catalog-banner-command-v2.service.js";
import { ConsoleCatalogMediaCleanupLog } from "../application/catalog-media-cleanup-log.js";
import { CatalogMediaCleanupV2Worker } from "../application/catalog-media-cleanup-v2.worker.js";
import { SequelizeCatalogBannerCommandV2Repository } from "../persistence/catalog-banner-command-v2.repository.js";
import { SequelizeCatalogMediaCleanupV2Repository } from "../persistence/catalog-media-cleanup-v2.repository.js";
import { CloudinaryCatalogMediaProvider } from "./cloudinary-catalog-media.provider.js";
import type { CatalogMediaProvider } from "../application/catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "../application/catalog-media-cleanup-log.js";

/** V2 remains opt-in until the HTTP/auth cutover; never falls back to a fake provider. */
export const createCatalogBannerMediaV2 = (persistence: V2Persistence, adapters: {
    mediaProvider?: CatalogMediaProvider;
    cleanupLog?: CatalogMediaCleanupLog;
} = {}) => {
    if (!adapters.mediaProvider && (!process.env.CLOUDINARY_CLOUD_NAME?.trim()
        || !process.env.CLOUDINARY_API_KEY?.trim()
        || !process.env.CLOUDINARY_API_SECRET?.trim())) {
        throw new Error("Cloudinary credentials are required for V2 banner media.");
    }
    const mediaProvider = adapters.mediaProvider ?? new CloudinaryCatalogMediaProvider();
    return {
        command: new CatalogBannerCommandV2Service({
            repository: new SequelizeCatalogBannerCommandV2Repository(persistence),
            mediaProvider,
            cleanupLog: adapters.cleanupLog ?? new ConsoleCatalogMediaCleanupLog(),
        }),
        worker: new CatalogMediaCleanupV2Worker({
            repository: new SequelizeCatalogMediaCleanupV2Repository(persistence),
            mediaProvider,
        }),
    };
};
