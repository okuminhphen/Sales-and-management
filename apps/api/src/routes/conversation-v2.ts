import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { ConversationMessageV2Service } from "../modules/communication-ai/application/conversation-message-v2.service.js";
import { ConversationV2Service } from "../modules/communication-ai/application/conversation-v2.service.js";
import { createConversationV2Router as createModuleRouter } from "../modules/communication-ai/interfaces/http/conversation-v2.routes.js";
import { SequelizeConversationMessageV2Repository } from "../modules/communication-ai/persistence/conversation-message-v2.repository.js";
import { SequelizeConversationOpenV2Repository } from "../modules/communication-ai/persistence/conversation-v2.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";

/** Isolated T36 composition; importing this file does not alter the legacy runtime. */
export const createConversationV2Router = (dependencies: {
    persistence: V2Persistence;
    audit?: V2HttpAuditWriter;
}): Router => {
    const { persistence } = dependencies;
    const auth = createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    });
    return createModuleRouter({
        auth,
        conversation: new ConversationV2Service({
            repository: new SequelizeConversationOpenV2Repository(persistence),
        }),
        messages: new ConversationMessageV2Service({
            repository: new SequelizeConversationMessageV2Repository(persistence),
        }),
        audit: dependencies.audit,
    });
};
