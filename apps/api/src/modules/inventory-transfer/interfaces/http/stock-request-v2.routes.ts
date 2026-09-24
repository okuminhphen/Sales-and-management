import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { StockRequestDecisionOutcome, StockRequestDecisionV2Service } from "../../application/stock-request-decision-v2.service.js";
import type { StockRequestCreateOutcome, StockRequestListOutcome,
    StockRequestMutationOutcome, StockRequestV2Service } from "../../application/stock-request-v2.service.js";
import { stockRequestV2BranchParams, stockRequestV2CreateBody, stockRequestV2PageQuery,
    stockRequestV2Params, stockRequestV2RejectBody, stockRequestV2UpdateBody } from "./stock-request-v2.dto.js";

const sendList = (response: Response, result: StockRequestListOutcome): void => {
    if (result.kind === "requests") {
        response.status(200).json({ EM: "Get stock requests successfully", EC: 0, DT: result.page.requests,
            pagination: { page: result.page.page, limit: result.page.limit,
                totalItems: result.page.totalItems,
                totalPages: Math.ceil(result.page.totalItems / result.page.limit) } });
        return;
    }
    sendFailure(response, result.kind);
};

const sendFailure = (response: Response, kind: string): void => {
    switch (kind) {
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_stock_request": response.status(400).json({ EM: "Invalid stock request", EC: 1, DT: null }); return;
        case "branch_not_found": response.status(404).json({ EM: "Branch not found", EC: 1, DT: null }); return;
        case "variant_not_found": response.status(404).json({ EM: "Product variant not found", EC: 1, DT: null }); return;
        case "request_not_found": response.status(404).json({ EM: "Stock request not found", EC: 1, DT: null }); return;
        case "request_already_processed": response.status(409).json({ EM: "Stock request already processed", EC: 1, DT: null }); return;
        default: response.status(503).json({ EM: "Stock request unavailable", EC: -1, DT: null });
    }
};

const sendMutation = (response: Response, result: StockRequestMutationOutcome): void => {
    if (result.kind === "updated" || result.kind === "cancelled") {
        response.status(200).json({ EM: `Stock request ${result.kind}`, EC: 0, DT: null });
        return;
    }
    sendFailure(response, result.kind);
};

const sendDecision = (response: Response, result: StockRequestDecisionOutcome): void => {
    if (result.kind === "approved") {
        response.locals.auditResourceId = result.stockRequestId;
        response.status(200).json({ EM: "Stock request approved", EC: 0, DT: {
            stockRequestId: result.stockRequestId, transferReceiptId: result.transferReceiptId } });
        return;
    }
    if (result.kind === "rejected") {
        response.status(200).json({ EM: "Stock request rejected", EC: 0, DT: null });
        return;
    }
    sendFailure(response, result.kind);
};

/** Standalone V2 stock-request routes; mounted only at the coordinated T40 cutover. */
export const createStockRequestV2Router = (dependencies: {
    auth: RequestHandler;
    service: StockRequestV2Service;
    decision: StockRequestDecisionV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.get("/stock-requests/my/:branchId", dependencies.auth,
        validateRequest({ params: stockRequestV2BranchParams, query: stockRequestV2PageQuery }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            sendList(response, await dependencies.service.listByBranch(context, request.params.branchId,
                Number(request.query.page), Number(request.query.limit)));
        });
    router.get("/admin/stock-requests/pending", dependencies.auth,
        validateRequest({ query: stockRequestV2PageQuery }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            sendList(response, await dependencies.service.listPending(context,
                Number(request.query.page), Number(request.query.limit)));
        });
    router.post("/stock-requests", createV2HttpAudit("stock_request.create", dependencies.audit),
        dependencies.auth, validateRequest({ body: stockRequestV2CreateBody }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            const result: StockRequestCreateOutcome = await dependencies.service.create(context, request.body);
            if (result.kind !== "created") { sendFailure(response, result.kind); return; }
            response.locals.auditResourceId = result.id;
            response.status(200).json({ EM: "Stock request created", EC: 0, DT: {
                id: result.id, code: result.code, fromBranchId: request.body.fromBranchId,
                toBranchId: request.body.toBranchId, status: "pending", createdBy: context.accountId,
                items: request.body.items } });
        });
    router.put("/stock-requests/:id", createV2HttpAudit("stock_request.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: stockRequestV2Params, body: stockRequestV2UpdateBody }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            response.locals.auditResourceId = request.params.id;
            sendMutation(response, await dependencies.service.update(context, request.params.id, request.body));
        });
    router.delete("/stock-requests/:id", createV2HttpAudit("stock_request.cancel", dependencies.audit),
        dependencies.auth, validateRequest({ params: stockRequestV2Params }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            response.locals.auditResourceId = request.params.id;
            sendMutation(response, await dependencies.service.cancel(context, request.params.id));
        });
    router.post("/admin/stock-requests/:id/approve",
        createV2HttpAudit("stock_request.approve", dependencies.audit), dependencies.auth,
        validateRequest({ params: stockRequestV2Params }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            response.locals.auditResourceId = request.params.id;
            sendDecision(response, await dependencies.decision.approve(context, request.params.id));
        });
    router.post("/admin/stock-requests/:id/reject",
        createV2HttpAudit("stock_request.reject", dependencies.audit), dependencies.auth,
        validateRequest({ params: stockRequestV2Params, body: stockRequestV2RejectBody }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            response.locals.auditResourceId = request.params.id;
            sendDecision(response, await dependencies.decision.reject(context, request.params.id, request.body.note));
        });
    return router;
};
