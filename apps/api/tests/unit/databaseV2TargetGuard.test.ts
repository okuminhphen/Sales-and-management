import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    V2MigrationTargetError,
    assertV2MigrationTarget,
    type V2MigrationTarget,
} from "../../src/database/v2/target-guard.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const schemaFile = "docs/database-v2/target-schema.dbml";
const schemaSource = readFileSync(path.join(repositoryRoot, schemaFile), "utf8");
const checksum = createHash("sha256").update(schemaSource).digest("hex");

const createTarget = (
    overrides: Partial<V2MigrationTarget> = {},
): V2MigrationTarget => ({
    enabled: true,
    nodeEnvironment: "test",
    targetDatabase: "sale_and_managements_db_test",
    schemaFile,
    schemaSource,
    expectedChecksum: checksum,
    ...overrides,
});

describe("Database V2 migration target guard", () => {
    it("accepts the reviewed _test database and schema artifact", () => {
        expect(() => assertV2MigrationTarget(createTarget())).not.toThrow();
    });

    it("fails closed when no explicit V2 target database is configured", () => {
        expect(() =>
            assertV2MigrationTarget(createTarget({ targetDatabase: undefined })),
        ).toThrowError(
            expect.objectContaining({ code: "V2_TARGET_DATABASE_REQUIRED" }),
        );
    });

    it("fails closed when the target database is not a dedicated _test database", () => {
        expect(() =>
            assertV2MigrationTarget(
                createTarget({ targetDatabase: "sale_and_managements_db" }),
            ),
        ).toThrowError(
            expect.objectContaining({ code: "V2_TARGET_DATABASE_NOT_TEST" }),
        );
    });

    it("fails closed for a schema outside the reviewed V2 artifact", () => {
        expect(() =>
            assertV2MigrationTarget(
                createTarget({ schemaFile: "docs/database-v2/unreviewed.dbml" }),
            ),
        ).toThrowError(
            expect.objectContaining({ code: "V2_SCHEMA_TARGET_UNEXPECTED" }),
        );
    });

    it("fails closed when the reviewed schema checksum drifts", () => {
        expect(() =>
            assertV2MigrationTarget(
                createTarget({ schemaSource: `${schemaSource}\n// unreviewed drift` }),
            ),
        ).toThrowError(
            expect.objectContaining({ code: "V2_SCHEMA_CHECKSUM_MISMATCH" }),
        );
    });
});
