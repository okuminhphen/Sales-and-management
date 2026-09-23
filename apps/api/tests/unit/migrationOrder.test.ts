import { describe, expect, it } from "vitest";
import {
    LEGACY_BASELINE_MIGRATION_STEMS,
    orderMigrationFileNames,
} from "../../src/database/migration-order.js";

describe("orderMigrationFileNames", () => {
    it("runs every legacy create-table migration before timestamp migrations", () => {
        const unordered = [
            "20251013122807-add-code-to-employee.ts",
            ...[...LEGACY_BASELINE_MIGRATION_STEMS].reverse().map((stem) => `${stem}.ts`),
            "20251015050053-add-code-to-category.ts",
        ];

        const ordered = orderMigrationFileNames(unordered);

        expect(ordered.slice(0, LEGACY_BASELINE_MIGRATION_STEMS.length)).toEqual(
            LEGACY_BASELINE_MIGRATION_STEMS.map((stem) => `${stem}.ts`),
        );
        expect(ordered.slice(LEGACY_BASELINE_MIGRATION_STEMS.length)).toEqual([
            "20251013122807-add-code-to-employee.ts",
            "20251015050053-add-code-to-category.ts",
        ]);
    });

    it("rejects an undeclared non-timestamp migration", () => {
        const files = [
            ...LEGACY_BASELINE_MIGRATION_STEMS.map((stem) => `${stem}.js`),
            "migrate-unknown.js",
        ];

        expect(() => orderMigrationFileNames(files)).toThrow(/Unsupported migration file/);
    });

    it("rejects an incomplete legacy baseline", () => {
        const files = LEGACY_BASELINE_MIGRATION_STEMS.slice(1).map((stem) => `${stem}.js`);

        expect(() => orderMigrationFileNames(files)).toThrow(/Missing baseline migration/);
    });
});
