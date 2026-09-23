/**
 * Best-effort diagnostic log for failed media cleanup attempts.
 *
 * Durable retry state lives in V2 outbox_events, not in this logger.
 */

export type MediaCleanupEntry = {
    readonly publicId: string;
    readonly reason: string;
    readonly error: string;
    readonly timestamp: string;
};

export interface CatalogMediaCleanupLog {
    /** Emit diagnostic context; failure must not change a committed business result. */
    recordFailedCleanup(entry: MediaCleanupEntry): void;
}

/**
 * Default implementation — writes structured JSON to stderr for monitoring.
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
