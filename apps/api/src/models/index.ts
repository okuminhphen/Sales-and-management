import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    DataTypes,
    Model,
    Sequelize,
    type ModelStatic,
} from "sequelize";
import { env } from "../config/env.js";

type AssociableModel = ModelStatic<Model> & {
    associate?: (models: Database) => void;
};

// The registry names are closed and compiler-checked. Individual legacy model attributes
// remain dynamic until each model is migrated to InferAttributes/InferCreationAttributes.
type LegacyModel = ModelStatic<Model & Record<string, any>>;

export interface Database {
    Admin: LegacyModel;
    Banner: LegacyModel;
    Branch: LegacyModel;
    Cart: LegacyModel;
    CartProductSize: LegacyModel;
    Category: LegacyModel;
    Conversation: LegacyModel;
    Employee: LegacyModel;
    Inventory: LegacyModel;
    InventoryMovement: LegacyModel;
    Message: LegacyModel;
    Notification: LegacyModel;
    Orders: LegacyModel;
    OrdersDetails: LegacyModel;
    OutboxEvent: LegacyModel;
    Payment: LegacyModel;
    PaymentMethods: LegacyModel;
    Product: LegacyModel;
    ProductSize: LegacyModel;
    Review: LegacyModel;
    Role: LegacyModel;
    Size: LegacyModel;
    StockHistory: LegacyModel;
    StockRequest: LegacyModel;
    StockRequestItem: LegacyModel;
    TransferHistory: LegacyModel;
    TransferReceipt: LegacyModel;
    TransferReceiptItem: LegacyModel;
    User: LegacyModel;
    UserBehavior: LegacyModel;
    UserRole: LegacyModel;
    Vouchers: LegacyModel;
    sequelize: Sequelize;
    Sequelize: any;
}

export const sequelize = new Sequelize({
    database: env.MYSQL_DATABASE,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    dialect: "mysql",
    timezone: "+07:00",
    logging: false,
    define: { freezeTableName: true },
    pool: {
        max: 10,
        min: 0,
        acquire: 30_000,
        idle: 10_000,
    },
});

const modelRegistry: Record<string, AssociableModel> = {};
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const runtimeExtension = path.extname(currentFile);

const loadModels = async (): Promise<void> => {
    const modelFiles = fs
        .readdirSync(currentDirectory)
        .filter(
            (file) =>
                path.extname(file) === runtimeExtension &&
                file !== `index${runtimeExtension}`
        );

    for (const file of modelFiles) {
        const moduleUrl = pathToFileURL(path.join(currentDirectory, file)).href;
        const { default: defineModel } = await import(moduleUrl);
        const model = defineModel(sequelize, DataTypes) as AssociableModel;
        modelRegistry[model.name] = model;
    }

    const database = modelRegistry as unknown as Database;
    for (const model of Object.values(modelRegistry)) {
        model.associate?.(database);
    }

    database.sequelize = sequelize;
    database.Sequelize = Sequelize;
};

await loadModels();

const db = modelRegistry as unknown as Database;

export default db;
