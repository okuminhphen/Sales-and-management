import { describe, expect, it, vi } from "vitest";
import type { Model, ModelStatic, Sequelize, Transaction } from "sequelize";
import {
    createV2ModelRegistry,
    createV2Persistence,
    v2ModelOptions,
    withV2Transaction,
    type V2PersistenceModule,
} from "../../src/database/v2/persistence.js";

const model = (name: string): ModelStatic<Model> => ({ name }) as unknown as ModelStatic<Model>;

describe("Database V2 persistence composition", () => {
    it("registers every module model before associations are composed", () => {
        const account = model("Account");
        const product = model("Product");
        const associate = vi.fn((registry) => {
            expect(registry.get("Account")).toBe(account);
            expect(registry.get("Product")).toBe(product);
        });
        const modules: readonly V2PersistenceModule[] = [
            { name: "identity-access", models: [{ name: "Account", model: account }] },
            { name: "catalog", models: [{ name: "Product", model: product }], associate },
        ];

        const registry = createV2ModelRegistry(modules);

        expect(registry.names()).toEqual(["Account", "Product"]);
        expect(associate).toHaveBeenCalledOnce();
    });

    it("rejects duplicate module names and model registrations", () => {
        expect(() => createV2ModelRegistry([
            { name: "identity-access", models: [{ name: "Account", model: model("Account") }] },
            { name: "identity-access", models: [] },
        ])).toThrow("module registered more than once");
        expect(() => createV2ModelRegistry([
            { name: "identity-access", models: [{ name: "Account", model: model("Account") }] },
            { name: "catalog", models: [{ name: "Account", model: model("AnotherAccount") }] },
        ])).toThrow("model registered more than once");
    });

    it("uses explicit table conventions and a single transaction boundary", async () => {
        expect(v2ModelOptions("account_roles")).toMatchObject({
            tableName: "account_roles",
            freezeTableName: true,
            timestamps: false,
        });
        expect(() => v2ModelOptions("AccountRoles")).toThrow("snake_case");

        const transaction = {} as Transaction;
        const callback = vi.fn(async (received: Transaction) => {
            expect(received).toBe(transaction);
            return "committed";
        });
        const sequelize = {
            transaction: vi.fn(async (work: (received: Transaction) => Promise<string>) => work(transaction)),
        } as unknown as Sequelize;

        await expect(withV2Transaction(sequelize, callback)).resolves.toBe("committed");
        expect(sequelize.transaction).toHaveBeenCalledOnce();

        const persistence = createV2Persistence(sequelize, []);
        expect(persistence.models.names()).toEqual([]);
        expect(persistence.sequelize).toBe(sequelize);
    });
});
