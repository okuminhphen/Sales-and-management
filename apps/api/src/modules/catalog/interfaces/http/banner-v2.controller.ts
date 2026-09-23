import type { Request, RequestHandler, Response } from "express";
import type { BannerCommandResult, CatalogBannerCommandV2Service } from "../../application/catalog-banner-command-v2.service.js";
import type { CatalogBannerQueryV2Service, CatalogBannerQueryResult } from "../../application/catalog-banner-query-v2.service.js";
import type { CatalogBannerAdminQueryV2Service, CatalogBannerAdminQueryResult } from "../../application/catalog-banner-admin-query-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

export type BannerV2HttpServices = {
    command: CatalogBannerCommandV2Service;
    query: CatalogBannerQueryV2Service;
    adminQuery: CatalogBannerAdminQueryV2Service;
};
const contextOf = (request: Request) => (request as V2AuthenticatedRequest).v2AccessContext;
const handle = (handler: (request: Request, response: Response) => Promise<void>): RequestHandler =>
    (request, response, next) => { void handler(request, response).catch(next); };

const sendCommand = (response: Response, result: BannerCommandResult): void => {
    switch (result.kind) {
        case "created":
            response.locals.auditResourceId = result.bannerId;
            response.status(200).json({ EM: "Create banner successfully", EC: 0, DT: { id: result.bannerId } }); return;
        case "updated": case "deleted": case "image_uploaded":
            response.status(200).json({ EM: "Banner saved successfully", EC: 0, DT: null }); return;
        case "banner_not_found":
            response.status(404).json({ EM: "Banner not found", EC: 2, DT: null }); return;
        case "forbidden":
            response.status(403).json({ EM: "Banner management permission required", EC: 3, DT: null }); return;
        case "invalid_banner":
            response.status(400).json({ EM: "Invalid banner", EC: 1, DT: null }); return;
        case "upload_failed": {
            const providerFailure = result.reason.startsWith("provider_");
            const status = result.reason === "file_too_large" ? 413 : providerFailure ? 503 : 400;
            response.status(status).json({ EM: providerFailure ? "Media service unavailable" : "Invalid banner image", EC: 1, DT: null }); return;
        }
        case "media_cleanup_required":
            response.status(409).json({ EM: "Banner media cleanup required", EC: 1, DT: null }); return;
        case "catalog_unavailable":
            response.status(503).json({ EM: "Banner service unavailable", EC: -1, DT: null }); return;
    }
};

const sendPage = (response: Response, result: CatalogBannerQueryResult | CatalogBannerAdminQueryResult): void => {
    if (result.kind === "banners") {
        const { banners, ...pagination } = result.page;
        response.status(200).json({ EM: "Get banners successfully", EC: 0,
            DT: banners.map((banner) => ({ id: banner.id, name: banner.name, image: banner.image,
                url: banner.targetUrl, status: "status" in banner ? banner.status : "active" })), pagination });
    } else if (result.kind === "invalid_banner_query") {
        response.status(400).json({ EM: "Invalid banner query", EC: 1, DT: [] });
    } else if (result.kind === "forbidden") {
        response.status(403).json({ EM: "Banner management permission required", EC: 3, DT: [] });
    } else {
        response.status(503).json({ EM: "Banner service unavailable", EC: -1, DT: [] });
    }
};

export const createBannerV2Controller = (services: BannerV2HttpServices) => ({
    listActive: handle(async (request, response) => { sendPage(response, await services.query.list(request.query)); }),
    listAll: handle(async (request, response) => {
        const context = contextOf(request);
        if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
        sendPage(response, await services.adminQuery.list(context, request.query));
    }),
    create: handle(async (request, response) => {
        const context = contextOf(request);
        if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
        sendCommand(response, await services.command.create(context, request.body, request.file));
    }),
    update: handle(async (request, response) => {
        response.locals.auditResourceId = request.params.bannerId;
        const context = contextOf(request);
        if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
        sendCommand(response, await services.command.update(context, request.params.bannerId, request.body, request.file));
    }),
    remove: handle(async (request, response) => {
        response.locals.auditResourceId = request.params.bannerId;
        const context = contextOf(request);
        if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
        sendCommand(response, await services.command.delete(context, request.params.bannerId));
    }),
});
