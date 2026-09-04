import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import type { RedisClientType } from "@redis/client";
import { env } from "./config/env.js";
import db from "./models/index.js";
import {
    verifyAccessToken,
    type AccessTokenClaims,
} from "./security/access-token.js";

interface MessagePayload {
    conversationId: number | string;
    message: string;
}

interface ClientEvents {
    join: (conversationId: number | string) => void;
    leave: (conversationId: number | string) => void;
    joinPayment: (orderId: number | string) => void;
    leavePayment: (orderId: number | string) => void;
    sendMessage: (payload: MessagePayload) => void;
}

interface ServerEvents {
    newMessage: (message: unknown) => void;
    "payment-success": (payload: unknown) => void;
    socketError: (payload: { code: string; message: string }) => void;
}

interface SocketData {
    principal: AccessTokenClaims;
}

type SocketServer = Server<
    ClientEvents,
    ServerEvents,
    Record<string, never>,
    SocketData
>;

let io: SocketServer | undefined;
let subscriber: RedisClientType | undefined;

const tokenFromCookie = (cookieHeader: string | undefined): string | undefined => {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(";")) {
        const [name, ...valueParts] = part.trim().split("=");
        if (name === "token") return decodeURIComponent(valueParts.join("="));
    }
    return undefined;
};

const canAccessConversation = async (
    principal: AccessTokenClaims,
    conversationId: string
): Promise<boolean> => {
    if (principal.adminId !== undefined) return true;
    if (principal.userId === undefined) return false;

    const conversation = await db.Conversation.findByPk(conversationId, {
        attributes: ["userId"],
    });
    return Number(conversation?.userId) === principal.userId;
};

const canAccessOrder = async (
    principal: AccessTokenClaims,
    orderId: string
): Promise<boolean> => {
    if (principal.adminId !== undefined) return true;
    if (principal.userId === undefined) return false;

    const order = await db.Orders.findByPk(orderId, { attributes: ["userId"] });
    return Number(order?.userId) === principal.userId;
};

export const initSocket = async (
    server: HttpServer,
    publisher?: RedisClientType
): Promise<SocketServer> => {
    io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(server, {
        cors: {
            origin: env.FRONTEND_URL.split(",").map((origin) => origin.trim()),
            credentials: true,
        },
    });

    io.use((socket, next) => {
        const handshakeToken = socket.handshake.auth.token;
        const token =
            typeof handshakeToken === "string"
                ? handshakeToken
                : tokenFromCookie(socket.request.headers.cookie);
        if (!token) {
            next(new Error("UNAUTHORIZED"));
            return;
        }

        try {
            socket.data.principal = verifyAccessToken(token);
            next();
        } catch {
            next(new Error("UNAUTHORIZED"));
        }
    });

    if (publisher) {
        subscriber = publisher.duplicate();
        await subscriber.connect();
        io.adapter(createAdapter(publisher, subscriber));
    }

    io.on("connection", (socket) => {
        socket.on("join", async (conversationId) => {
            const room = String(conversationId);
            if (await canAccessConversation(socket.data.principal, room)) {
                await socket.join(room);
                return;
            }
            socket.emit("socketError", {
                code: "FORBIDDEN_CONVERSATION",
                message: "You cannot access this conversation",
            });
        });

        socket.on("leave", (conversationId) => {
            void socket.leave(String(conversationId));
        });

        socket.on("joinPayment", async (orderId) => {
            const id = String(orderId);
            if (await canAccessOrder(socket.data.principal, id)) {
                await socket.join(`order:${id}`);
                return;
            }
            socket.emit("socketError", {
                code: "FORBIDDEN_ORDER",
                message: "You cannot subscribe to this order",
            });
        });

        socket.on("leavePayment", (orderId) => {
            void socket.leave(`order:${String(orderId)}`);
        });

        socket.on("sendMessage", async (payload) => {
            const { conversationId, message } = payload;
            if (!conversationId || !message?.trim()) return;

            const room = String(conversationId);
            const principal = socket.data.principal;
            const authorized =
                socket.rooms.has(room) ||
                (await canAccessConversation(principal, room));
            if (!authorized) {
                socket.emit("socketError", {
                    code: "FORBIDDEN_CONVERSATION",
                    message: "You cannot send to this conversation",
                });
                return;
            }

            const senderId = principal.adminId ?? principal.userId;
            const senderRole = principal.adminId !== undefined ? "admin" : "user";
            if (senderId === undefined) return;

            try {
                const savedMessage = await db.Message.create({
                    conversationId,
                    senderId,
                    senderRole,
                    message: message.trim(),
                });
                io?.to(room).emit("newMessage", savedMessage);
            } catch (error) {
                console.error("Unable to persist WebSocket message", error);
            }
        });
    });

    return io;
};

export const getIO = (): SocketServer => {
    if (!io) throw new Error("Socket.IO has not been initialized");
    return io;
};

export const closeSocket = async (): Promise<void> => {
    if (subscriber?.isOpen) await subscriber.quit();
    if (io) await new Promise<void>((resolve) => io?.close(() => resolve()));
};
