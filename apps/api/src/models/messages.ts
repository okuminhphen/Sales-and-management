import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Message extends Model {
        static associate(models) {
            Message.belongsTo(models.Conversation, {
                foreignKey: "conversationId",
                as: "conversation",
            });
            Message.belongsTo(models.User, {
                foreignKey: "senderId",
                as: "sender",
            });
        }
    }

    Message.init(
        {
            conversationId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            senderId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            senderRole: {
                type: DataTypes.ENUM("user", "admin"),
                allowNull: false,
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: "Message",
            tableName: "messages",
        }
    );

    return Message;
};
