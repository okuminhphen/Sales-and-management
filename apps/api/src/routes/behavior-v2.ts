import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { BehaviorV2Service } from "../modules/communication-ai/application/behavior-v2.service.js";
import { createBehaviorV2Router as createModuleRouter } from "../modules/communication-ai/interfaces/http/behavior-v2.routes.js";
import { SequelizeBehaviorV2Repository } from "../modules/communication-ai/persistence/behavior-v2.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";

export const createBehaviorV2Router = (dependencies: { persistence: V2Persistence; audit?: V2HttpAuditWriter }): Router =>
    createModuleRouter({
        auth: createV2AuthMiddleware({ accessContexts: new SequelizeV2AccessContextRepository(dependencies.persistence) }),
        audit: dependencies.audit,
        service: new BehaviorV2Service(new SequelizeBehaviorV2Repository(dependencies.persistence)),
    });
