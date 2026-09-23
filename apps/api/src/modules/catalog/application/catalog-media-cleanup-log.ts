/**
 * Port for recording failed media cleanup attempts.
 *
 * When the service successfully commits a DB change that orphans an old
 * image but the subsequent provider delete fails, this log records the
 * publicId so it can be retried (manually, by a future worker, or via
 * monitoring alert on structured logs).
 */

export type MediaCleanupEntry = {
    readonly publicId: string;
    readonly reason: string;
    readonly error: string;
    readonly timestamp: string;
};

export interface CatalogMediaCleanupLog {
    /** Record a failed media cleanup so it can be retried later. */
    recordFailedCleanup(entry: MediaCleanupEntry): void;
}

/**
 * Default implementation — writes structured JSON to stderr so it is
 * capturable by log aggregators, container runtimes, and monitoring tools.
 */
export class ConsoleCatalogMediaCleanupLog implements CatalogMediaCleanupLog {
    recordFailedCleanup(entry: MediaCleanupEntry): void {
        console.error(JSON.stringify({
            level: "error",
            category: "media_cleanup_pending",
            ...entry,
        }));
    }
}
