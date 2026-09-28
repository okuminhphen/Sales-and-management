import { createHash } from "node:crypto";

export const APPROVED_V2_SCHEMA_FILE = "docs/database-v2/target-schema.dbml";
export const LOCAL_V2_CUTOVER_DATABASE = "sale_and_managements_db";
export const LOCAL_V2_CUTOVER_CONFIRMATION = `RESET ${LOCAL_V2_CUTOVER_DATABASE}`;

export type V2MigrationTarget = {
    enabled: boolean;
    nodeEnvironment: "development" | "test" | "production";
    targetDatabase?: string;
    schemaFile: string;
    schemaSource: string;
    expectedChecksum: string;
};

export type LocalV2CutoverTarget = V2MigrationTarget & {
    configuredDatabase: string;
    confirmation?: string;
};

export type ConfiguredV2MigrationTarget = V2MigrationTarget & {
    configuredDatabase: string;
};

export type V2MigrationTargetErrorCode =
    | "V2_MIGRATIONS_NOT_ENABLED"
    | "V2_TARGET_DATABASE_REQUIRED"
    | "V2_TARGET_DATABASE_INVALID"
    | "V2_TARGET_DATABASE_NOT_TEST"
    | "V2_TARGET_DATABASE_MISMATCH"
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

const assertReviewedV2MigrationTarget = (target: V2MigrationTarget): string => {
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

    return database;
};

export const assertV2MigrationTarget = (target: V2MigrationTarget): void => {
    const database = assertReviewedV2MigrationTarget(target);
    if (!database.endsWith("_test")) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_NOT_TEST",
            "Database V2 test migrations require a dedicated database ending in _test.",
        );
    }
};

export const assertConfiguredV2MigrationTarget = (
    target: ConfiguredV2MigrationTarget,
): void => {
    const database = assertReviewedV2MigrationTarget(target);
    if (database !== target.configuredDatabase.trim()) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_MISMATCH",
            "The Database V2 migration target must exactly match MYSQL_DATABASE.",
        );
    }
};

/**
 * This guard is exclusively for the explicit local fresh-database cutover command.
 * The ordinary V2 migration runner remains restricted to a dedicated `_test` database.
 */
export const assertApprovedLocalV2CutoverTarget = (
    target: LocalV2CutoverTarget,
): void => {
    const database = target.targetDatabase?.trim();
    if (
        target.nodeEnvironment !== "development" ||
        database !== LOCAL_V2_CUTOVER_DATABASE ||
        target.configuredDatabase !== LOCAL_V2_CUTOVER_DATABASE ||
        target.confirmation !== LOCAL_V2_CUTOVER_CONFIRMATION
    ) {
        throw new V2MigrationTargetError(
            "V2_TARGET_DATABASE_NOT_TEST",
            "Local V2 cutover requires development, the approved database, and exact confirmation.",
        );
    }

    if (!target.enabled) {
        throw new V2MigrationTargetError(
            "V2_MIGRATIONS_NOT_ENABLED",
            "Local V2 cutover requires V2_MIGRATIONS_ENABLED=true.",
        );
    }

    if (normalizeSchemaFile(target.schemaFile) !== APPROVED_V2_SCHEMA_FILE) {
        throw new V2MigrationTargetError(
            "V2_SCHEMA_TARGET_UNEXPECTED",
            "Local V2 cutover only accepts the reviewed target-schema.dbml artifact.",
        );
    }

    const actualChecksum = createHash("sha256").update(target.schemaSource).digest("hex");
    if (actualChecksum !== target.expectedChecksum.toLowerCase()) {
        throw new V2MigrationTargetError(
            "V2_SCHEMA_CHECKSUM_MISMATCH",
            "Local V2 cutover schema checksum does not match its manifest.",
        );
    }
};
