import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { createTransferV2Router } from "../../src/modules/inventory-transfer/interfaces/http/transfer-v2.routes.js";

const context: V2AccessContext = { accountId: "11", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" },
        permissions: ["transfer.read.branch", "transfer.manage.branch"] }] };

describe("Transfer V2 HTTP contract", () => {
    it("requires explicit string item IDs and quantities before calling receipt services", async () => {
        const complete = vi.fn().mockResolvedValue({ kind: "completed", transferReceiptId: "41" });
        const record = vi.fn().mockResolvedValue({ kind: "recorded" });
        const approveDiscrepancy = vi.fn().mockResolvedValue({ kind: "separation_of_duties" });
        const app = express();
        app.use(express.json());
        app.use(createTransferV2Router({
            auth: (req, _res, next) => { (req as typeof req & { v2AccessContext: V2AccessContext }).v2AccessContext = context; next(); },
            query: { list: vi.fn().mockResolvedValue({ kind: "receipts", page: { receipts: [], page: 1,
                limit: 20, totalItems: 0 } }), detail: vi.fn().mockResolvedValue({ kind: "transfer_not_found" }) } as never,
            approval: { approve: vi.fn().mockResolvedValue({ kind: "approved", transferReceiptId: "41" }) } as never,
            dispatch: { dispatch: vi.fn().mockResolvedValue({ kind: "dispatched", transferReceiptId: "41" }) } as never,
            closure: { cancel: vi.fn().mockResolvedValue({ kind: "cancelled" }),
                reject: vi.fn().mockResolvedValue({ kind: "rejected" }) } as never,
            receipt: { complete } as never,
            discrepancy: { record, approve: approveDiscrepancy } as never,
            audit: vi.fn(),
        }));
        const url = "/transfer-receipts/41";
        expect((await request(app).post(`${url}/complete`).send({})).status).toBe(400);
        expect((await request(app).post(`${url}/complete`).send({ items: [{ itemId: 12,
            receivedQuantity: 2, lostQuantity: 0, nonSellableQuantity: 0 }] })).status).toBe(400);
        expect((await request(app).post(`${url}/complete`).send({ items: [{ itemId: "12",
            receivedQuantity: 2, lostQuantity: 0, nonSellableQuantity: 0 }] })).status).toBe(200);
        expect(complete).toHaveBeenCalledExactlyOnceWith(context, "41", [{ itemId: "12",
            receivedQuantity: 2, lostQuantity: 0, nonSellableQuantity: 0 }]);
        expect((await request(app).post(`${url}/record-discrepancy`).send({ items: [{ itemId: "12",
            receivedQuantity: 1, lostQuantity: 1, nonSellableQuantity: 0 }], note: "  Lost  " })).status).toBe(200);
        expect(record).toHaveBeenCalledExactlyOnceWith(context, "41", [{ itemId: "12",
            receivedQuantity: 1, lostQuantity: 1, nonSellableQuantity: 0 }], "Lost");
        expect((await request(app).post(`${url}/approve-discrepancy`).send({ note: "Approved" })).status).toBe(409);
        expect(approveDiscrepancy).toHaveBeenCalledExactlyOnceWith(context, "41", "Approved");
    });
});
