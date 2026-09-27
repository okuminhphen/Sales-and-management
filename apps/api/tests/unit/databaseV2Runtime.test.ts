import { describe, expect, it } from "vitest";
import { createV2RuntimePersistence } from "../../src/database/v2/runtime.js";

describe("Database V2 runtime persistence", () => {
    it("creates one closed registry containing all V2 models", () => {
        const persistence = createV2RuntimePersistence();

        expect(persistence.models.names()).toHaveLength(49);
        expect(persistence.models.names()).toContain("Account");
        expect(persistence.models.names()).toContain("OutboxEvent");
    });
});
