import conversationService from "./conversation.service.js";

const createFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }

        let data = await conversationService.createConversation(
            userId,
            null
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

const getByUserFunc = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.userId);
        const userId = req.user?.userId ?? requestedUserId;
        if (!userId || (req.user?.adminId === undefined && userId !== requestedUserId)) {
            return res.status(403).json({ EM: "Conversation access denied", EC: 3, DT: null });
        }

        let data = await conversationService.getUserConversation(userId);

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

const readAdminFunc = async (req, res) => {
    try {
        let data = await conversationService.getAllConversations();

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
    createFunc,
    getByUserFunc,
    readAdminFunc,
};
