import type { NextFunction, Request, Response } from "express";
import type { SizeService } from "./size.service.js";
import type { CreateSizeCommand, UpdateSizeCommand } from "./size.types.js";

export type CacheInvalidator = (pattern: string) => Promise<void>;

export class SizeController {
    constructor(
        private readonly service: SizeService,
        private readonly invalidateCache: CacheInvalidator
    ) {}

    list = async (
        _request: Request,
        response: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const sizes = await this.service.list();
            response.status(200).json({ EM: "Get sizes success", EC: 0, DT: sizes });
        } catch (error: unknown) {
            next(error);
        }
    };

    create = async (
        request: Request,
        response: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const size = await this.service.create(request.body as CreateSizeCommand);
            await this.invalidateCache("size:*");
            response.status(201).json({ EM: "Create size successfully", EC: 0, DT: size });
        } catch (error: unknown) {
            next(error);
        }
    };

    update = async (
        request: Request,
        response: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const size = await this.service.update(request.body as UpdateSizeCommand);
            if (!size) {
                response.status(404).json({ EM: "Size not found", EC: 2, DT: null });
                return;
            }
            await this.invalidateCache("size:*");
            response.status(200).json({ EM: "Update size successfully", EC: 0, DT: size });
        } catch (error: unknown) {
            next(error);
        }
    };

    delete = async (
        request: Request,
        response: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const deleted = await this.service.delete(Number(request.params.id));
            if (!deleted) {
                response.status(404).json({ EM: "Size not found", EC: 1, DT: null });
                return;
            }
            await this.invalidateCache("size:*");
            response.status(200).json({ EM: "Delete size successfully", EC: 0, DT: null });
        } catch (error: unknown) {
            next(error);
        }
    };
}
