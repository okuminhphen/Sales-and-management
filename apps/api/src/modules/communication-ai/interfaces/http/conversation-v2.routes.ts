import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { ConversationMessageV2Service } from "../../application/conversation-message-v2.service.js";
import type { ConversationV2Service } from "../../application/conversation-v2.service.js";
import { createConversationV2Controller } from "./conversation-v2.controller.js";
import {
    conversationMessageParamsV2,
    customerMessageBodyV2,
    customerMessageHistoryQueryV2,
    openConversationBodyV2,
} from "./conversation-v2.dto.js";

/** V2-only compatibility factory. The legacy API and Socket runtime do not mount this router. */
export const createConversationV2Router = (dependencies: {
    auth: RequestHandler;
    conversation: ConversationV2Service;
    messages: ConversationMessageV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    const controller = createConversationV2Controller(dependencies);
    router.post("/conversation/create", createV2HttpAudit("conversation.open", dependencies.audit), dependencies.auth,
        validateRequest({ body: openConversationBodyV2 }), controller.open);
    router.post("/message/send/:conversationId", createV2HttpAudit("conversation.message.send", dependencies.audit), dependencies.auth,
        validateRequest({ params: conversationMessageParamsV2, body: customerMessageBodyV2 }), controller.send);
    router.get("/message/get/:conversationId", dependencies.auth,
        validateRequest({ params: conversationMessageParamsV2, query: customerMessageHistoryQueryV2 }), controller.history);
    return router;
};
