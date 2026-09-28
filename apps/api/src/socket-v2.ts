import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { RedisClientType } from "@redis/client";
import { createAdapter } from "@socket.io/redis-adapter";
import { QueryTypes } from "sequelize";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import type { V2Persistence } from "./database/v2/persistence.js";
import { ConversationMessageV2Service } from "./modules/communication-ai/application/conversation-message-v2.service.js";
import { SequelizeConversationMessageV2Repository } from "./modules/communication-ai/persistence/conversation-message-v2.repository.js";
import type { V2AccessContext } from "./modules/identity-access/application/access-context.js";
import { SequelizeV2AccessContextRepository } from "./modules/identity-access/persistence/v2-access-context.repository.js";
import { verifyV2AccessToken, type V2AccessTokenClaims } from "./security/v2-access-token.js";
import { serializeEntityId } from "./shared/contracts/database-scalars.js";

interface MessagePayload { conversationId: number | string; message: string; clientMessageId?: string }
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
interface SocketData { claims: V2AccessTokenClaims }
type SocketServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

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

const customerOwnsConversation = async (
    persistence: V2Persistence,
    context: V2AccessContext,
    conversationId: string,
): Promise<boolean> => {
    if (!context.customerId) return false;
    const rows = await persistence.sequelize.query<{ id: unknown }>(
        `SELECT conversations.id AS id
         FROM conversations
         INNER JOIN customers ON customers.id = conversations.customer_id
         INNER JOIN accounts ON accounts.id = customers.account_id
         WHERE conversations.id = ? AND conversations.customer_id = ?
           AND customers.account_id = ? AND customers.status = 'active'
           AND accounts.status = 'active' LIMIT 1`,
        { replacements: [conversationId, context.customerId, context.accountId], type: QueryTypes.SELECT },
    );
    return rows.length === 1;
};

const customerOwnsOrder = async (
    persistence: V2Persistence,
    context: V2AccessContext,
    orderId: string,
): Promise<boolean> => {
    if (!context.customerId) return false;
    const rows = await persistence.sequelize.query<{ id: unknown }>(
        `SELECT orders.id AS id FROM orders
         INNER JOIN customers ON customers.id = orders.customer_id
         INNER JOIN accounts ON accounts.id = customers.account_id
         WHERE orders.id = ? AND orders.customer_id = ? AND customers.account_id = ?
           AND customers.status = 'active' AND accounts.status = 'active' LIMIT 1`,
        { replacements: [orderId, context.customerId, context.accountId], type: QueryTypes.SELECT },
    );
    return rows.length === 1;
};

/** V2 Socket boundary: every command rehydrates authorization and persists before emitting. */
export const initV2Socket = async (
    server: HttpServer,
    persistence: V2Persistence,
    publisher?: RedisClientType,
): Promise<SocketServer> => {
    const contexts = new SequelizeV2AccessContextRepository(persistence);
    const messages = new ConversationMessageV2Service({
        repository: new SequelizeConversationMessageV2Repository(persistence),
    });
    io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(server, {
        cors: { origin: env.FRONTEND_URL.split(",").map((origin) => origin.trim()), credentials: true },
    });
    io.use((socket, next) => {
        const handshakeToken = socket.handshake.auth.token;
        const token = typeof handshakeToken === "string" ? handshakeToken : tokenFromCookie(socket.request.headers.cookie);
        if (!token) return next(new Error("UNAUTHORIZED"));
        try { socket.data.claims = verifyV2AccessToken(token); next(); }
        catch { next(new Error("UNAUTHORIZED")); }
    });
    if (publisher) {
        subscriber = publisher.duplicate();
        await subscriber.connect();
        io.adapter(createAdapter(publisher, subscriber));
    }
    const currentContext = (claims: V2AccessTokenClaims) => contexts.findActiveByAccountId(claims.accountId);
    io.on("connection", (socket) => {
        socket.on("join", async (rawId) => {
            try {
                const conversationId = serializeEntityId(rawId);
                const context = await currentContext(socket.data.claims);
                if (context && await customerOwnsConversation(persistence, context, conversationId)) {
                    await socket.join(conversationId);
                    return;
                }
            } catch { /* invalid identifiers are unauthorized */ }
            socket.emit("socketError", { code: "FORBIDDEN_CONVERSATION", message: "You cannot access this conversation" });
        });
        socket.on("leave", (rawId) => {
            try { void socket.leave(serializeEntityId(rawId)); } catch { /* no room to leave */ }
        });
        socket.on("joinPayment", async (rawId) => {
            try {
                const orderId = serializeEntityId(rawId);
                const context = await currentContext(socket.data.claims);
                if (context && await customerOwnsOrder(persistence, context, orderId)) {
                    await socket.join(`order:${orderId}`);
                    return;
                }
            } catch { /* invalid identifiers are unauthorized */ }
            socket.emit("socketError", { code: "FORBIDDEN_ORDER", message: "You cannot subscribe to this order" });
        });
        socket.on("leavePayment", (rawId) => {
            try { void socket.leave(`order:${serializeEntityId(rawId)}`); } catch { /* no room to leave */ }
        });
        socket.on("sendMessage", async (payload) => {
            try {
                const context = await currentContext(socket.data.claims);
                if (!context || !payload || typeof payload !== "object") throw new Error("unauthorized");
                const result = await messages.sendOwn(context, {
                    conversationId: payload.conversationId,
                    clientMessageId: payload.clientMessageId ?? `socket:${randomUUID()}`,
                    content: payload.message,
                });
                if (result.kind === "message") {
                    io?.to(result.message.conversationId).emit("newMessage", result.message);
                    return;
                }
            } catch { /* fail closed without exposing database details */ }
            socket.emit("socketError", { code: "MESSAGE_REJECTED", message: "Message could not be persisted" });
        });
    });
    return io;
};

export const closeV2Socket = async (): Promise<void> => {
    if (subscriber?.isOpen) await subscriber.quit();
    if (io) await new Promise<void>((resolve) => io?.close(() => resolve()));
    subscriber = undefined;
    io = undefined;
};
