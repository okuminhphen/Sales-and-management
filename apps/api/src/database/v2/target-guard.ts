import { createHash } from "node:crypto";

export const APPROVED_V2_SCHEMA_FILE = "docs/database-v2/target-schema.dbml";

export type V2MigrationTarget = {
    enabled: boolean;
    nodeEnvironment: "development" | "test" | "production";
    targetDatabase?: string;
    schemaFile: string;
    schemaSource: string;
    expectedChecksum: string;
};

export type V2MigrationTargetErrorCode =
    | "V2_MIGRATIONS_NOT_ENABLED"
    | "V2_TARGET_DATABASE_REQUIRED"
    | "V2_TARGET_DATABASE_INVALID"
    | "V2_TARGET_DATABASE_NOT_TEST"
    | "V2_SCHEMA_TARGET_UNEXPECTED"
    | "V2_SCHEMA_CHECKSUM_INVALID"
    | "V2_SCHEMA_CHECKSUM_MISMATCH";

export class V2MigrationTargetError extends Error {
    public readonly code: V2MigrationTargetErrorCode;

    public constructor(code: V2MigrationTargetErrorCode, message: string) {
        super(message);
        this.name = "V2MigrationTargetError";
        this.code = code;
    }
}

const normalizeSchemaFile = (schemaFile: string): string =>
    schemaFile.replaceAll("\\", "/").replace(/^\.\//, "");

export const assertV2MigrationTarget = (target: V2MigrationTarget): void => {
    if (!target.enabled) {
        throw new V2MigrationTargetError(
            "V2_MIGRATIONS_NOT_ENABLED",
            "Database V2 migrations require V2_MIGRATIONS_ENABLED=true.",
        );
    }

    const database = target.targetDatabase?.trim();
    if (!database) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_REQUIRED",
            "Database V2 migrations require an explicit V2_MIGRATIONS_TARGET_DATABASE.",
        );
    }

    if (!/^[A-Za-z0-9$_]+$/.test(database)) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_INVALID",
            "The Database V2 migration target must be a plain MySQL database identifier.",
        );
    }

    if (!database.endsWith("_test")) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_NOT_TEST",
            "Database V2 migrations are restricted to a dedicated database ending in _test.",
        );
    }

    if (normalizeSchemaFile(target.schemaFile) !== APPROVED_V2_SCHEMA_FILE) {
        throw new V2MigrationTargetError(
            "V2_SCHEMA_TARGET_UNEXPECTED",
            "Database V2 migrations only accept the reviewed target-schema.dbml artifact.",
        );
    }

    if (!/^[a-f0-9]{64}$/i.test(target.expectedChecksum)) {
        throw new V2MigrationTargetError(
            "V2_SCHEMA_CHECKSUM_INVALID",
            "The Database V2 schema manifest must contain a SHA-256 checksum.",
        );
    }

    const actualChecksum = createHash("sha256")
        .update(target.schemaSource)
        .digest("hex");

    if (actualChecksum !== target.expectedChecksum.toLowerCase()) {
        throw new V2MigrationTargetError(
            "V2_SCHEMA_CHECKSUM_MISMATCH",
            "The reviewed Database V2 schema checksum does not match its manifest.",
        );
    }
};
