import type { NextFunction, Request, Response } from "express";
import {
    signAccessToken,
    verifyAccessToken,
    type AccessTokenClaims,
} from "../security/access-token.js";

// 1️⃣ Hàm tạo token khi đăng nhập thành công
const generateToken = (user: AccessTokenClaims): string => signAccessToken(user);

// 2️⃣ Middleware xác thực token từ cookies
const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    const token =
        req.cookies.token || req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        res
            .status(401)
            .json({ message: "Unauthorized - No token provided" });
        return;
    }

    try {
        req.user = verifyAccessToken(token);
        next();
    } catch (error: unknown) {
        console.error("Token verification error:", error);
        res
            .status(403)
            .json({ message: "Forbidden - Invalid or expired token" });
        return;
    }
};

export { generateToken, verifyToken };
