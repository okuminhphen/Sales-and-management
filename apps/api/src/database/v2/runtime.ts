import { Sequelize } from "sequelize";
import { env } from "../../config/env.js";
import { createSalesV2Persistence } from "./models.js";
import type { V2Persistence } from "./persistence.js";

export const createV2RuntimeSequelize = (): Sequelize => new Sequelize({
    database: env.MYSQL_DATABASE,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    dialect: "mysql",
    timezone: "+07:00",
    logging: false,
    pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
});

export const createV2RuntimePersistence = (): V2Persistence =>
    createSalesV2Persistence(createV2RuntimeSequelize());
