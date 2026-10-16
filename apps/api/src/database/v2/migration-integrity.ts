import { createHash } from "node:crypto";

type MigrationManifest = {
    schemaRevision: number;
    hashAlgorithm: "sha256-lf";
    migrations: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

export const parseApprovedMigrationChecksums = (
    manifest: unknown,
    schemaRevision: number,
): ReadonlyMap<string, string> => {
    if (!isRecord(manifest) || manifest.schemaRevision !== schemaRevision) {
        throw new Error("Database V2 migration manifest schema revision mismatch.");
    }
    if (manifest.hashAlgorithm !== "sha256-lf" || !isRecord(manifest.migrations)) {
        throw new Error("Database V2 migration manifest has an invalid hash contract.");
    }

    const approved = manifest.migrations as MigrationManifest["migrations"];
    const approvedNames = Object.keys(approved).sort();
    if (approvedNames.length === 0) throw new Error("Database V2 migration inventory is empty.");
    const checksums = new Map<string, string>();
    for (const name of approvedNames) {
        const checksum = approved[name];
        if (!/^[0-9]{4}-[a-z0-9-]+$/.test(name) || !checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
            throw new Error("Database V2 migration manifest contains an invalid entry.");
        }
        checksums.set(name, checksum);
    }
    return checksums;
};

export const assertMigrationSources = (
    manifest: unknown,
    sources: ReadonlyMap<string, string>,
    schemaRevision: number,
): ReadonlyMap<string, string> => {
    const approved = parseApprovedMigrationChecksums(manifest, schemaRevision);
    const approvedNames = [...approved.keys()];
    const sourceNames = [...sources.keys()].sort();
    if (
        approvedNames.length !== sourceNames.length ||
        approvedNames.some((name, index) => name !== sourceNames[index])
    ) {
        throw new Error("Database V2 migration inventory mismatch.");
    }

    const checksums = new Map<string, string>();
    for (const name of approvedNames) {
        const expected = approved.get(name);
        const source = sources.get(name);
        if (!expected || source === undefined) throw new Error("Database V2 migration inventory mismatch.");
        const actual = createHash("sha256")
            .update(source.replace(/\r\n/g, "\n"))
            .digest("hex");
        if (actual !== expected) {
            throw new Error("Database V2 migration checksum mismatch: " + name + ".");
        }
        checksums.set(name, expected);
    }
    return checksums;
};

export const assertExecutedMigrationChecksums = (
    rows: ReadonlyArray<{ name: string; checksum: string }>,
    approved: ReadonlyMap<string, string>,
): string[] => {
    for (const row of rows) {
        if (approved.get(row.name) !== row.checksum) {
            throw new Error("Database V2 executed migration checksum mismatch: " + row.name + ".");
        }
    }
    return rows.map((row) => row.name);
};
