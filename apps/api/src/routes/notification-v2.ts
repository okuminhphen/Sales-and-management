import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { NotificationV2Service } from "../modules/communication-ai/application/notification-v2.service.js";
import { createNotificationV2Router as createModuleRouter } from "../modules/communication-ai/interfaces/http/notification-v2.routes.js";
import { SequelizeNotificationV2Repository } from "../modules/communication-ai/persistence/notification-v2.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";

/** Isolated T37 composition. The legacy runtime must not import or mount this before cutover. */
export const createNotificationV2Router = (dependencies: {
    persistence: V2Persistence;
    audit?: V2HttpAuditWriter;
}): Router => createModuleRouter({
    auth: createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(dependencies.persistence),
    }),
    notifications: new NotificationV2Service({
        repository: new SequelizeNotificationV2Repository(dependencies.persistence),
    }),
    audit: dependencies.audit,
});
