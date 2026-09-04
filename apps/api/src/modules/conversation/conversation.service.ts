import db from "../../models/index.js";
import type { AccessTokenClaims } from "../../security/access-token.js";

const canAccessConversation = async (
    conversationId,
    actor?: AccessTokenClaims
) => {
    if (actor?.adminId !== undefined) return true;
    if (actor?.userId === undefined) return false;
    const conversation = await db.Conversation.findByPk(conversationId, {
        attributes: ["userId"],
    });
    return Number(conversation?.userId) === actor.userId;
};

const createConversation = async (userId, adminId = null) => {
    try {
        // Check existing conversation
        const existing = await db.Conversation.findOne({
            where: { userId },
        });

        if (existing) {
            return {
                EC: 0,
                EM: "Conversation already exists",
                DT: existing,
            };
        }

        const conversation = await db.Conversation.create({
            userId,
            adminId,
        });

        return {
            EC: 0,
            EM: "Create conversation successfully",
            DT: conversation,
        };
    } catch (err) {
        console.log(err);
        return { EC: 1, EM: "Error creating conversation", DT: null };
    }
};

const getUserConversation = async (userId) => {
    try {
        const data = await db.Conversation.findOne({
            where: { userId },
            include: [
                {
                    model: db.Message,
                    as: "messages",
                    order: [["createdAt", "ASC"]],
                },
            ],
        });

        return {
            EC: 0,
            EM: "Get conversation successfully",
            DT: data,
        };
    } catch (err) {
        console.log(err);
        return { EC: 1, EM: "Error getting conversation", DT: null };
    }
};

const getAllConversations = async () => {
    try {
        const data = await db.Conversation.findAll({
            include: [
                { model: db.Message, as: "messages" },
                {
                    model: db.User,
                    as: "user",
                    attributes: ["id", "fullname", "username", "email"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return {
            EC: 0,
            EM: "Get conversations successfully",
            DT: data,
        };
    } catch (err) {
        console.log(err);
        return { EC: 1, EM: "Error getting conversations", DT: null };
    }
};

export default {
    canAccessConversation,
    createConversation,
    getUserConversation,
    getAllConversations,
};
