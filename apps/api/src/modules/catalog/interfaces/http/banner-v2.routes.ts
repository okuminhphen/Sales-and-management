import { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { canManageBanners } from "../../application/catalog-banner-policy.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import { createBannerV2Controller, type BannerV2HttpServices } from "./banner-v2.controller.js";
import { bannerCreateBodyV2, bannerUpdateBodyV2, bannerIdParamsV2, bannerListQueryV2 } from "./banner-v2.dto.js";
import { bannerUploadV2 } from "./banner-v2.upload.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";

const requireManager: RequestHandler = (request, response, next) => {
    const context = (request as V2AuthenticatedRequest).v2AccessContext;
    if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
    if (!canManageBanners(context)) {
        response.status(403).json({ EM: "Banner management permission required", EC: 3, DT: null }); return;
    }
    next();
};

/** Opt-in V2 routes. Auth and global permission run before buffering any image. */
export const createBannerV2Router = (dependencies: BannerV2HttpServices & { auth: RequestHandler; audit?: V2HttpAuditWriter }): Router => {
    const router = Router();
    const controller = createBannerV2Controller(dependencies);
    const managers = [dependencies.auth, requireManager];
    router.get("/banner/read/active", validateRequest({ query: bannerListQueryV2 }), controller.listActive);
    router.get("/banner/read", ...managers, validateRequest({ query: bannerListQueryV2 }), controller.listAll);
    router.post("/banner/create", createV2HttpAudit("banner.create", dependencies.audit), ...managers, bannerUploadV2,
        validateRequest({ body: bannerCreateBodyV2 }), controller.create);
    router.put("/banner/update/:bannerId", createV2HttpAudit("banner.update", dependencies.audit), ...managers, validateRequest({ params: bannerIdParamsV2 }),
        bannerUploadV2, validateRequest({ body: bannerUpdateBodyV2 }), controller.update);
    router.delete("/banner/delete/:bannerId", createV2HttpAudit("banner.delete", dependencies.audit), ...managers, validateRequest({ params: bannerIdParamsV2 }), controller.remove);
    const onError: ErrorRequestHandler = (_error, _request, response, next) => {
        if (response.headersSent) { next(_error); return; }
        response.status(503).json({ EM: "Banner service unavailable", EC: -1, DT: null });
    };
    router.use(onError);
    return router;
};
