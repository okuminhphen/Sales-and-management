import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { InventoryBranchQueryV2Service } from "../../application/inventory-branch-query-v2.service.js";
import { inventoryBranchV2Params } from "./inventory-v2.dto.js";

/** Standalone V2 replacement for the existing backoffice GET /inventory/:branchId. */
export const createInventoryV2Router = (dependencies: {
    auth: RequestHandler;
    query: InventoryBranchQueryV2Service;
}): Router => {
    const router = Router();
    router.get("/inventory/:branchId", dependencies.auth,
        validateRequest({ params: inventoryBranchV2Params }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            const result = await dependencies.query.list(context, request.params.branchId);
            switch (result.kind) {
                case "inventory": response.status(200).json({ EM: "Get inventory by branch success", EC: 0, DT: result.products }); return;
                case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
                case "invalid_inventory_query": response.status(400).json({ EM: "Invalid branch ID", EC: 1, DT: null }); return;
                case "branch_not_found": response.status(404).json({ EM: "Branch not found", EC: 1, DT: null }); return;
                case "inventory_unavailable": response.status(503).json({ EM: "Inventory unavailable", EC: -1, DT: null }); return;
            }
        });
    return router;
};
