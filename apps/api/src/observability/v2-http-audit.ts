import type { RequestHandler } from "express";
import type { V2AuthenticatedRequest } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { serializeEntityId } from "../shared/contracts/database-scalars.js";
import { logger } from "./logger.js";

export type V2HttpAuditEntry = {
    action: string;
    accountId: string | null;
    resourceId: string | null;
    requestId: string | null;
    statusCode: number;
    outcome: "succeeded" | "rejected" | "failed" | "connection_closed";
};
export type V2HttpAuditWriter = (entry: V2HttpAuditEntry) => void;
const writeAudit: V2HttpAuditWriter = (entry) => logger.info("v2_http.mutation_audit", entry);
const safeId = (value: unknown): string | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Operational audit only, not a transactional ledger. Never copy bodies, tokens or URLs. */
export const createV2HttpAudit = (action: string, write: V2HttpAuditWriter = writeAudit): RequestHandler =>
    (request, response, next) => {
        let recorded = false;
        const record = (closed: boolean): void => {
            if (recorded) return;
            recorded = true;
            const context = (request as V2AuthenticatedRequest).v2AccessContext;
            const requestId = typeof request.requestId === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(request.requestId)
                ? request.requestId : null;
            try {
                write({ action, accountId: safeId(context?.accountId), requestId,
                    resourceId: safeId(response.locals.auditResourceId), statusCode: response.statusCode,
                    outcome: closed ? "connection_closed" : response.statusCode >= 500 ? "failed"
                        : response.statusCode >= 400 ? "rejected" : "succeeded" });
            } catch {
                // Logging failure cannot undo the mutation or change a response already sent.
            }
        };
        response.once("finish", () => record(false));
        response.once("close", () => record(!response.writableFinished));
        next();
    };
