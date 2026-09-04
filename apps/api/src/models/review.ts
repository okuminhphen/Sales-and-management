"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Review extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            Review.belongsTo(models.User, {
                foreignKey: "userId",
                as: "user",
            }); // N - M với User
            Review.belongsTo(models.Product, { foreignKey: "productId" });
        }
    }
    Review.init(
        {
            reviewDate: DataTypes.DATE,
            reviewText: DataTypes.TEXT,
            rating: DataTypes.INTEGER,
        },
        {
            sequelize,
            modelName: "Review",
        }
    );
    return Review;
};

