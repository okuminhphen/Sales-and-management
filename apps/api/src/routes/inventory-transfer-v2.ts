import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import { StockRequestDecisionV2Service } from "../modules/inventory-transfer/application/stock-request-decision-v2.service.js";
import { StockRequestV2Service } from "../modules/inventory-transfer/application/stock-request-v2.service.js";
import { TransferApprovalV2Service } from "../modules/inventory-transfer/application/transfer-approval-v2.service.js";
import { TransferClosureV2Service } from "../modules/inventory-transfer/application/transfer-closure-v2.service.js";
import { TransferDiscrepancyV2Service } from "../modules/inventory-transfer/application/transfer-discrepancy-v2.service.js";
import { TransferDispatchV2Service } from "../modules/inventory-transfer/application/transfer-dispatch-v2.service.js";
import { TransferQueryV2Service } from "../modules/inventory-transfer/application/transfer-query-v2.service.js";
import { TransferReceiptV2Service } from "../modules/inventory-transfer/application/transfer-receipt-v2.service.js";
import { createStockRequestV2Router } from "../modules/inventory-transfer/interfaces/http/stock-request-v2.routes.js";
import { createTransferV2Router } from "../modules/inventory-transfer/interfaces/http/transfer-v2.routes.js";
import { SequelizeStockRequestDecisionV2Repository } from "../modules/inventory-transfer/persistence/stock-request-decision-v2.repository.js";
import { SequelizeStockRequestV2Repository } from "../modules/inventory-transfer/persistence/stock-request-v2.repository.js";
import { SequelizeTransferApprovalV2Repository } from "../modules/inventory-transfer/persistence/transfer-approval-v2.repository.js";
import { SequelizeTransferClosureV2Repository } from "../modules/inventory-transfer/persistence/transfer-closure-v2.repository.js";
import { SequelizeTransferDiscrepancyV2Repository } from "../modules/inventory-transfer/persistence/transfer-discrepancy-v2.repository.js";
import { SequelizeTransferDispatchV2Repository } from "../modules/inventory-transfer/persistence/transfer-dispatch-v2.repository.js";
import { SequelizeTransferQueryV2Repository } from "../modules/inventory-transfer/persistence/transfer-query-v2.repository.js";
import { SequelizeTransferReceiptV2Repository } from "../modules/inventory-transfer/persistence/transfer-receipt-v2.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";

/** Composes every stock-request and transfer endpoint exclusively against V2 persistence. */
export const createInventoryTransferV2Router = (dependencies: {
    persistence: V2Persistence;
    audit?: V2HttpAuditWriter;
}): Router => {
    const { persistence, audit } = dependencies;
    const auth = createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    });
    const router = Router();
    router.use(createStockRequestV2Router({
        auth,
        audit,
        service: new StockRequestV2Service({ repository: new SequelizeStockRequestV2Repository(persistence) }),
        decision: new StockRequestDecisionV2Service({
            repository: new SequelizeStockRequestDecisionV2Repository(persistence),
        }),
    }));
    router.use(createTransferV2Router({
        auth,
        audit,
        query: new TransferQueryV2Service({ repository: new SequelizeTransferQueryV2Repository(persistence) }),
        approval: new TransferApprovalV2Service({ repository: new SequelizeTransferApprovalV2Repository(persistence) }),
        dispatch: new TransferDispatchV2Service({ repository: new SequelizeTransferDispatchV2Repository(persistence) }),
        closure: new TransferClosureV2Service({ repository: new SequelizeTransferClosureV2Repository(persistence) }),
        receipt: new TransferReceiptV2Service({ repository: new SequelizeTransferReceiptV2Repository(persistence) }),
        discrepancy: new TransferDiscrepancyV2Service({
            repository: new SequelizeTransferDiscrepancyV2Repository(persistence),
        }),
    }));
    return router;
};
