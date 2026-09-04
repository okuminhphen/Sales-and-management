import { Sequelize } from "sequelize";
import { sequelize } from "../models/index.js";
import superAdminSeed from "../seeders/20251111142033-seed-super-admin.js";

const run = async (): Promise<void> => {
    await sequelize.authenticate();
    await superAdminSeed.up(sequelize.getQueryInterface(), Sequelize);
};

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => sequelize.close());
