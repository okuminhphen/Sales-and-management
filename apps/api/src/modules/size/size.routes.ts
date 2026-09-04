import { Router, type RequestHandler } from "express";
import { cache } from "../../middlewares/cache.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
import { SequelizeSizeRepository } from "./sequelize-size.repository.js";
import { SizeController, type CacheInvalidator } from "./size.controller.js";
import { SizeService } from "./size.service.js";
import { createSizeBody, sizeIdParams, updateSizeBody } from "./size.dto.js";

interface SizeRouterDependencies {
    service?: SizeService;
    invalidateCache?: CacheInvalidator;
    readCache?: RequestHandler;
    writeGuards?: RequestHandler[];
}

export const createSizeRouter = (
    dependencies: SizeRouterDependencies = {}
): Router => {
    const router = Router();
    const service =
        dependencies.service ?? new SizeService(new SequelizeSizeRepository());
    const controller = new SizeController(
        service,
        dependencies.invalidateCache ?? clearCacheByPattern
    );
    const writeGuards = dependencies.writeGuards ?? [];

    router.get("/read", dependencies.readCache ?? cache("size:all"), controller.list);
    router.post("/create", ...writeGuards, validateRequest({ body: createSizeBody }), controller.create);
    router.put("/update", ...writeGuards, validateRequest({ body: updateSizeBody }), controller.update);
    router.delete("/delete/:id", ...writeGuards, validateRequest({ params: sizeIdParams }), controller.delete);

    return router;
};
