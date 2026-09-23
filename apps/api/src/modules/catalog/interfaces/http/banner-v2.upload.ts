import type { RequestHandler } from "express";
import multer from "multer";
import { MAX_BANNER_IMAGE_BYTES, BANNER_IMAGE_MIME_TYPES } from "../../application/catalog-media-provider.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BANNER_IMAGE_BYTES, files: 1, fields: 3, parts: 5, fieldSize: 4096 },
    fileFilter: (_request, file, callback) => {
        if (!BANNER_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(new Error("Unsupported banner image format"));
            return;
        }
        callback(null, true);
    },
}).single("banner");

/** Buffer at most one bounded file; provider uploads only start after DTO validation. */
export const bannerUploadV2: RequestHandler = (request, response, next) => {
    upload(request, response, (error: unknown) => {
        if (!error) { next(); return; }
        const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
        response.status(tooLarge ? 413 : 400).json({
            EM: tooLarge ? "Banner image exceeds 5 MiB" : "Invalid banner upload", EC: 1, DT: null,
        });
    });
};
