import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { InventoryBranchQueryV2Service } from "../modules/inventory-transfer/application/inventory-branch-query-v2.service.js";
import { SequelizeInventoryBranchV2Repository } from "../modules/inventory-transfer/persistence/inventory-branch-query-v2.repository.js";
import { createInventoryV2Router as createModuleRouter } from "../modules/inventory-transfer/interfaces/http/inventory-v2.routes.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";

/** T29 standalone composition; legacy app mounting waits for guarded V2 cutover. */
export const createInventoryV2Router = (persistence: V2Persistence): Router => {
    const router = Router();
    router.use(createModuleRouter({
        auth: createV2AuthMiddleware({ accessContexts: new SequelizeV2AccessContextRepository(persistence) }),
        query: new InventoryBranchQueryV2Service({ repository: new SequelizeInventoryBranchV2Repository(persistence) }),
    }));
    return router;
};
