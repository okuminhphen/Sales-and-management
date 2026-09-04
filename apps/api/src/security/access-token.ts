import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

const accessTokenClaimsSchema = z
    .object({
        userId: z.number().int().positive().optional(),
        adminId: z.number().int().positive().optional(),
        branchId: z.number().int().positive().nullable().optional(),
        role: z.string().min(1),
    })
    .refine((claims) => claims.userId !== undefined || claims.adminId !== undefined, {
        message: "Token must identify a user or admin",
    });

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export const signAccessToken = (claims: AccessTokenClaims): string => {
    const validatedClaims = accessTokenClaimsSchema.parse(claims);
    return jwt.sign(validatedClaims, env.JWT_SECRET, { expiresIn: "1d" });
};

export const verifyAccessToken = (token: string): AccessTokenClaims =>
    accessTokenClaimsSchema.parse(jwt.verify(token, env.JWT_SECRET));
