import { Sequelize } from "sequelize";
import { databaseEnv, type DatabaseEnv } from "../../config/database-env.js";

/** SQL UTC_TIMESTAMP and ORM Date writes must use the same session clock. */
export const createV2Sequelize = (database = databaseEnv.MYSQL_DATABASE, settings: DatabaseEnv = databaseEnv): Sequelize => new Sequelize({
    database,
    username: settings.MYSQL_USER,
    password: settings.MYSQL_PASSWORD,
    host: settings.MYSQL_HOST,
    port: settings.MYSQL_PORT,
    dialect: "mysql",
    dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
    timezone: "+00:00",
    logging: false,
    pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
});
