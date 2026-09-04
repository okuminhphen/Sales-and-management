import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Conversation extends Model {
        static associate(models) {
            // 1 Conversation có nhiều Message
            Conversation.hasMany(models.Message, {
                foreignKey: "conversationId",
                as: "messages",
                onDelete: "CASCADE",
            });
            // Conversation belongs to User
            Conversation.belongsTo(models.User, {
                foreignKey: "userId",
                as: "user",
            });
            // Conversation belongs to Admin (optional)
            Conversation.belongsTo(models.Admin, {
                foreignKey: "adminId",
                as: "admin",
            });
        }
    }

    Conversation.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                unique: true,
                allowNull: false,
            },
            adminId: {
                type: DataTypes.INTEGER,
                allowNull: true, // admin có thể vào trả lời sau
            },
        },
        {
            sequelize,
            modelName: "Conversation",
            tableName: "conversations",
        }
    );

    return Conversation;
};
