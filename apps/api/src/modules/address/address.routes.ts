import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import addressController from "./address.controller.js";
import { districtQuery, provinceQuery } from "./address.dto.js";

export const createAddressRouter = (): Router => {
    const router = Router();
    router.get("/address/provinces", addressController.getProvinces);
    router.get("/address/districts", validateRequest({ query: provinceQuery }), addressController.getDistricts);
    router.get("/address/wards", validateRequest({ query: districtQuery }), addressController.getWards);
    return router;
};
