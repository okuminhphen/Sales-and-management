const DEFAULT_MAX_ATTEMPTS = 5;

const getMySqlErrorCode = (error: unknown): string | null => {
    if (!error || typeof error !== "object") return null;
    const withNestedDatabaseError = error as { parent?: unknown; original?: unknown };
    for (const key of ["parent", "original"] as const) {
        const nested = withNestedDatabaseError[key];
        if (
            nested
            && typeof nested === "object"
            && "code" in nested
            && typeof nested.code === "string"
        ) return nested.code;
    }
    return null;
};

const isRetryableMySqlTransactionError = (error: unknown): boolean => {
    const code = getMySqlErrorCode(error);
    return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
};

const waitForRetry = async (attempt: number): Promise<void> => {
    const boundedJitter = Math.floor(Math.random() * 25);
    const delayMs = (25 * (2 ** attempt)) + boundedJitter;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};

/** Retries only MySQL transaction conflicts; validation and integrity errors fail immediately. */
export const retryV2Transaction = async <Result>(
    work: () => Promise<Result>,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<Result> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await work();
        } catch (error) {
            const canRetry = attempt < maxAttempts - 1 && isRetryableMySqlTransactionError(error);
            if (!canRetry) throw error;
            await waitForRetry(attempt);
        }
    }
    throw new Error("V2 transaction retry exhausted without an error result.");
};
