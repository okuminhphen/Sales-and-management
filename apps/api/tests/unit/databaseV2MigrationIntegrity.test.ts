import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    assertExecutedMigrationChecksums,
    assertMigrationSources,
} from "../../src/database/v2/migration-integrity.js";

const checksum = (source: string) =>
    createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");

describe("Database V2 migration integrity", () => {
    const manifest = {
        schemaRevision: 4,
        hashAlgorithm: "sha256-lf",
        migrations: { "0001-example": checksum("export default {};\n") },
    };

    it("accepts a pinned migration regardless of checkout line endings", () => {
        const expected = assertMigrationSources(
            manifest, new Map([["0001-example", "export default {};\r\n"]]), 4,
        );
        expect(expected.get("0001-example")).toBe(manifest.migrations["0001-example"]);
    });

    it("rejects edited migration source and unknown migration files", () => {
        expect(() => assertMigrationSources(
            manifest, new Map([["0001-example", "export default { up: true };\n"]]), 4,
        )).toThrow("checksum mismatch");
        expect(() => assertMigrationSources(
            manifest, new Map([
                ["0001-example", "export default {};\n"],
                ["0002-unreviewed", "export default {};\n"],
            ]), 4,
        )).toThrow("inventory mismatch");
    });

    it("rejects a manifest from another schema revision", () => {
        expect(() => assertMigrationSources(
            { ...manifest, schemaRevision: 3 },
            new Map([["0001-example", "export default {};\n"]]), 4,
        )).toThrow("schema revision");
    });

    it("rejects tampered or unknown executed migration metadata", () => {
        const approved = new Map([["0001-example", manifest.migrations["0001-example"]]]);
        expect(() => assertExecutedMigrationChecksums(
            [{ name: "0001-example", checksum: "0".repeat(64) }], approved,
        )).toThrow("executed migration checksum mismatch");
        expect(() => assertExecutedMigrationChecksums(
            [{ name: "0002-unknown", checksum: "0".repeat(64) }], approved,
        )).toThrow("executed migration checksum mismatch");
    });
});
