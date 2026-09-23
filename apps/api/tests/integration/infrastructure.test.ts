import { DataTypes } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    connectRedis,
    disconnectRedis,
} from "../../src/config/redis.js";
import { env } from "../../src/config/env.js";
import { sequelize } from "../../src/models/index.js";
import { SequelizeSizeRepository } from "../../src/modules/size/sequelize-size.repository.js";

const runInfrastructureTests = process.env.RUN_INFRASTRUCTURE_TESTS === "true";

describe.skipIf(!runInfrastructureTests)("MySQL and Redis integration", () => {
    const repository = new SequelizeSizeRepository();
    const queryInterface = sequelize.getQueryInterface();

    beforeAll(async () => {
        if (!env.MYSQL_DATABASE.endsWith("_test")) {
            throw new Error(
                "Infrastructure tests require an isolated MYSQL_DATABASE ending in _test"
            );
        }
        await sequelize.authenticate();
        await queryInterface.dropTable("Size").catch(() => undefined);
        await queryInterface.createTable("Size", {
            id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            createdAt: { type: DataTypes.DATE, allowNull: false },
            updatedAt: { type: DataTypes.DATE, allowNull: false },
        });
    });

    afterAll(async () => {
        await queryInterface.dropTable("Size");
        await disconnectRedis();
        await sequelize.close();
    });

    it("persists the size module through its Sequelize adapter", async () => {
        const created = await repository.create({ name: "M" });
        expect(created).toMatchObject({ name: "M" });

        expect(await repository.list()).toEqual([created]);
        expect(await repository.update({ id: created.id, name: "L" })).toEqual({
            id: created.id,
            name: "L",
        });
        expect(await repository.delete(created.id)).toBe(true);
        expect(await repository.list()).toEqual([]);
    });

    it("round-trips an ephemeral value through Redis", async () => {
        const redis = await connectRedis();
        const key = "integration:health";

        await redis.set(key, "ok", { EX: 10 });
        expect(await redis.get(key)).toBe("ok");
        await redis.del(key);
    });
});
