import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { TransferApprovalV2Service } from "../../application/transfer-approval-v2.service.js";
import type { TransferClosureV2Service } from "../../application/transfer-closure-v2.service.js";
import type { TransferDiscrepancyV2Service } from "../../application/transfer-discrepancy-v2.service.js";
import type { TransferDispatchV2Service } from "../../application/transfer-dispatch-v2.service.js";
import type { TransferQueryV2Service } from "../../application/transfer-query-v2.service.js";
import type { TransferReceiptV2Service } from "../../application/transfer-receipt-v2.service.js";
import { transferV2DiscrepancyBody, transferV2NoteBody, transferV2PageQuery,
    transferV2Params, transferV2ReceiveBody, transferV2RejectBody } from "./transfer-v2.dto.js";

const sendFailure = (response: Response, kind: string): void => {
    switch (kind) {
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_transfer": case "invalid_discrepancy":
            response.status(400).json({ EM: "Invalid transfer request", EC: 1, DT: null }); return;
        case "transfer_not_found":
            response.status(404).json({ EM: "Transfer receipt not found", EC: 1, DT: null }); return;
        case "transfer_already_processed": case "already_recorded": case "transfer_conflict":
        case "discrepancy_requires_approval": case "separation_of_duties": case "insufficient_stock":
            response.status(409).json({ EM: kind, EC: 1, DT: null }); return;
        default: response.status(503).json({ EM: "Transfer receipt unavailable", EC: -1, DT: null });
    }
};

/** Standalone V2 replacement for legacy transfer routes; only T40 may mount it. */
export const createTransferV2Router = (dependencies: {
    auth: RequestHandler;
    query: TransferQueryV2Service;
    approval: TransferApprovalV2Service;
    dispatch: TransferDispatchV2Service;
    closure: TransferClosureV2Service;
    receipt: TransferReceiptV2Service;
    discrepancy: TransferDiscrepancyV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    const context = (request: V2AuthenticatedRequest) => request.v2AccessContext!;
    const audit = (action: string) => createV2HttpAudit(`transfer.${action}`, dependencies.audit);

    router.get("/transfer-receipts", dependencies.auth,
        validateRequest({ query: transferV2PageQuery }), async (request, response) => {
            const result = await dependencies.query.list(context(request), Number(request.query.page), Number(request.query.limit));
            if (result.kind !== "receipts") { sendFailure(response, result.kind); return; }
            const { receipts, page, limit, totalItems } = result.page;
            response.status(200).json({ EM: "Get transfer receipts success", EC: 0, DT: receipts,
                pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } });
        });
    router.get("/transfer-receipts/:id", dependencies.auth,
        validateRequest({ params: transferV2Params }), async (request, response) => {
            const result = await dependencies.query.detail(context(request), request.params.id);
            if (result.kind !== "receipt") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Get transfer receipt detail success", EC: 0, DT: result.receipt });
        });

    router.post("/transfer-receipts/:id/approve", audit("approve"), dependencies.auth,
        validateRequest({ params: transferV2Params }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.approval.approve(context(request), request.params.id);
            if (result.kind !== "approved") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer receipt approved", EC: 0,
                DT: { id: result.transferReceiptId, status: "approved" } });
        });
    router.post("/transfer-receipts/:id/dispatch", audit("dispatch"), dependencies.auth,
        validateRequest({ params: transferV2Params }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.dispatch.dispatch(context(request), request.params.id);
            if (result.kind !== "dispatched") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer receipt dispatched", EC: 0,
                DT: { id: result.transferReceiptId, status: "in_transit" } });
        });
    router.post("/transfer-receipts/:id/complete", audit("complete"), dependencies.auth,
        validateRequest({ params: transferV2Params, body: transferV2ReceiveBody }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.receipt.complete(context(request), request.params.id, request.body.items);
            if (result.kind !== "completed") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer receipt completed", EC: 0,
                DT: { id: result.transferReceiptId, status: "completed" } });
        });
    router.post("/transfer-receipts/:id/record-discrepancy", audit("record_discrepancy"), dependencies.auth,
        validateRequest({ params: transferV2Params, body: transferV2DiscrepancyBody }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.discrepancy.record(context(request), request.params.id,
                request.body.items, request.body.note);
            if (result.kind !== "recorded") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer discrepancy recorded", EC: 0, DT: null });
        });
    router.post("/transfer-receipts/:id/approve-discrepancy", audit("approve_discrepancy"), dependencies.auth,
        validateRequest({ params: transferV2Params, body: transferV2NoteBody }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.discrepancy.approve(context(request), request.params.id, request.body.note);
            if (result.kind !== "completed") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer discrepancy approved", EC: 0,
                DT: { id: result.transferReceiptId, status: "completed" } });
        });
    router.post("/transfer-receipts/:id/reject", audit("reject"), dependencies.auth,
        validateRequest({ params: transferV2Params, body: transferV2RejectBody }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.closure.reject(context(request), request.params.id, request.body.reason);
            if (result.kind !== "rejected") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer receipt rejected", EC: 0, DT: null });
        });
    router.post("/transfer-receipts/:id/cancel", audit("cancel"), dependencies.auth,
        validateRequest({ params: transferV2Params }), async (request, response) => {
            response.locals.auditResourceId = request.params.id;
            const result = await dependencies.closure.cancel(context(request), request.params.id);
            if (result.kind !== "cancelled") { sendFailure(response, result.kind); return; }
            response.status(200).json({ EM: "Transfer receipt cancelled", EC: 0, DT: null });
        });
    return router;
};
