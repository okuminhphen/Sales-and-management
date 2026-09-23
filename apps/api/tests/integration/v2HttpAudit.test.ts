import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createV2HttpAudit, type V2HttpAuditEntry } from "../../src/observability/v2-http-audit.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";

describe("V2 HTTP mutation audit", () => {
    it("records only verified actor, canonical resource and outcome, never request secrets", async () => {
        const entries: V2HttpAuditEntry[] = [];
        const app = express();
        app.use(express.json());
        app.post("/test", createV2HttpAudit("banner.create", (entry) => entries.push(entry)), (req, res) => {
            (req as V2AuthenticatedRequest).v2AccessContext = { accountId: "7", customerId: null, employeeId: null, grants: [] };
            res.locals.auditResourceId = "9007199254740993";
            res.json({ EC: 0 });
        });
        await request(app).post("/test").set("Authorization", "Bearer private-token")
            .send({ accountId: "999", password: "private-password", url: "https://private.example/path" }).expect(200);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ action: "banner.create", accountId: "7", resourceId: "9007199254740993",
            statusCode: 200, outcome: "succeeded" });
        expect(JSON.stringify(entries)).not.toMatch(/private|999|password|authorization/i);
    });

    it("records unauthorized attempts without claiming an actor", async () => {
        const entries: V2HttpAuditEntry[] = [];
        const app = express();
        app.delete("/test", createV2HttpAudit("banner.delete", (entry) => entries.push(entry)), (_req, res) => res.sendStatus(401));
        await request(app).delete("/test").expect(401);
        expect(entries[0]).toMatchObject({ accountId: null, outcome: "rejected", statusCode: 401 });
    });

    it("does not change a committed success when the diagnostic sink fails", async () => {
        const app = express();
        app.post("/test", createV2HttpAudit("cart.add", () => { throw new Error("sink unavailable"); }),
            (_req, res) => res.json({ EC: 0 }));
        await request(app).post("/test").expect(200, { EC: 0 });
    });
});
