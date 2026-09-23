import path from "node:path";

/**
 * The original create-table migrations predate timestamped migrations. Their filenames do
 * not encode dependency order, so keep the legacy baseline explicit and append all modern
 * timestamped migrations chronologically.
 */
export const LEGACY_BASELINE_MIGRATION_STEMS = [
    "migrate-branch",
    "migrate-role",
    "migrate-user",
    "migrate-user-role",
    "migrate-category",
    "migrate-product",
    "migrate-size",
    "migrate-product-size",
    "migrate-cart",
    "migrate-cart-product-size",
    "migrate-orders",
    "migrate-orders-details",
    "migrate-payment-methods",
    "migrate-payment",
    "migrate-review",
    "migrate-banner",
    "migrate-vouchers",
    "migrate-employee",
    "migrate-inventory",
] as const;

const TIMESTAMPED_MIGRATION_PATTERN = /^\d{14}-.+$/;

export const orderMigrationFileNames = (fileNames: readonly string[]): string[] => {
    const fileByStem = new Map<string, string>();

    for (const fileName of fileNames) {
        const stem = path.parse(fileName).name;
        if (fileByStem.has(stem)) {
            throw new Error(`Duplicate migration stem: ${stem}`);
        }
        fileByStem.set(stem, fileName);
    }

    for (const stem of LEGACY_BASELINE_MIGRATION_STEMS) {
        if (!fileByStem.has(stem)) {
            throw new Error(`Missing baseline migration: ${stem}`);
        }
    }

    const baselineStemSet = new Set<string>(LEGACY_BASELINE_MIGRATION_STEMS);
    const unsupported = [...fileByStem.keys()].filter(
        (stem) => !baselineStemSet.has(stem) && !TIMESTAMPED_MIGRATION_PATTERN.test(stem),
    );
    if (unsupported.length > 0) {
        throw new Error(`Unsupported migration file: ${unsupported.sort().join(", ")}`);
    }

    const baseline = LEGACY_BASELINE_MIGRATION_STEMS.map((stem) => fileByStem.get(stem)!);
    const timestamped = [...fileByStem.entries()]
        .filter(([stem]) => TIMESTAMPED_MIGRATION_PATTERN.test(stem))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, fileName]) => fileName);

    return [...baseline, ...timestamped];
};
