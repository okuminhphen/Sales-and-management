import messageService from "./message.service.js";
import conversationService from "../conversation/conversation.service.js";

const sendFunc = async (req, res) => {
    try {
        let { conversationId } = req.params;
        const { message } = req.body;
        if (!(await conversationService.canAccessConversation(conversationId, req.user))) {
            return res.status(403).json({ EM: "Conversation access denied", EC: 3, DT: null });
        }
        const senderId = req.user?.adminId ?? req.user?.userId;
        const senderRole = req.user?.adminId !== undefined ? "admin" : "user";
        if (!senderId || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ EM: "Invalid message", EC: 1, DT: null });
        }

        let data = await messageService.sendMessage(
            conversationId,
            senderId,
            senderRole,
            message.trim()
        );

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: -1,
            DT: null,
        });
    }
};

const getFunc = async (req, res) => {
    try {
        let { conversationId } = req.params;
        if (!(await conversationService.canAccessConversation(conversationId, req.user))) {
            return res.status(403).json({ EM: "Conversation access denied", EC: 3, DT: null });
        }

        let data = await messageService.getMessagesByConversation(
            conversationId
        );

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: -1,
            DT: null,
        });
    }
};

export default {
    sendFunc,
    getFunc,
};
