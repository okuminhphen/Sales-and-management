import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createV2RuntimePersistence } from "../../src/database/v2/runtime.js";
import type { CatalogMediaProvider } from "../../src/modules/catalog/application/catalog-media-provider.js";
import { createApiV2Router } from "../../src/routes/api-v2.js";

const mediaProvider: CatalogMediaProvider = {
    upload: async () => ({ kind: "provider_error", message: "disabled in composition test" }),
    delete: async () => ({ kind: "provider_error", message: "disabled in composition test" }),
};

describe("V2 runtime composition", () => {
    it("does not import the legacy model registry or API router from runtime entrypoints", () => {
        for (const relativePath of ["../../src/app.ts", "../../src/main.ts", "../../src/socket-v2.ts"]) {
            const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
            expect(source).not.toMatch(/(?:models\/index|routes\/api\.js|\.\/socket\.js)/);
        }
    });

    it("mounts stock transfer, payment method and API-to-AI boundaries atomically", async () => {
        const persistence = createV2RuntimePersistence();
        const app = createApp({ apiRouter: createApiV2Router({ persistence, mediaProvider }) });

        await request(app).get("/api/v1/transfer-receipts?page=1&limit=20").expect(401);
        await request(app).get("/api/v1/payment-methods").expect(401);
        await request(app).post("/api/v1/bot/chat").send({}).expect(400);

        await persistence.sequelize.close();
    });
});
