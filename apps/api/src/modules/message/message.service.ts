import db from "../../models/index.js";

const sendMessage = async (conversationId, senderId, senderRole, message) => {
    try {
        const msg = await db.Message.create({
            conversationId,
            senderId,
            senderRole,
            message,
        });

        return {
            EC: 0,
            EM: "Send message successfully",
            DT: msg,
        };
    } catch (err) {
        console.log(err);
        return { EC: 1, EM: "Error sending message", DT: null };
    }
};

const getMessagesByConversation = async (conversationId) => {
    try {
        const messages = await db.Message.findAll({
            where: { conversationId },
            order: [["createdAt", "ASC"]],
            include: [
                {
                    model: db.User,
                    as: "sender", // 🔥 BẮT BUỘC PHẢI CÓ
                    attributes: ["id", "fullname", "email"],
                },
            ],
        });

        return {
            EC: 0,
            EM: "Get messages successfully",
            DT: messages,
        };
    } catch (err) {
        console.log(err);
        return { EC: 1, EM: "Error getting messages", DT: null };
    }
};

export default {
    sendMessage,
    getMessagesByConversation,
};
