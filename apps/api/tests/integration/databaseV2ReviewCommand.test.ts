import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { ReviewCommandV2Service } from "../../src/modules/review/application/review-command-v2.service.js";
import { SequelizeReviewCommandV2Repository } from "../../src/modules/review/persistence/review-command-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 review command on MySQL", () => {
    let sequelize: Sequelize;
    let service: ReviewCommandV2Service;
    let owner: V2AccessContext;
    let other: V2AccessContext;
    let productId: string;

    const one = async <Row extends object>(sql: string, replacements: unknown[]): Promise<Row> => {
        const rows = await sequelize.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing review fixture row.");
        return rows[0];
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        service = new ReviewCommandV2Service({
            repository: new SequelizeReviewCommandV2Repository(createSalesV2Persistence(sequelize)),
        });
    });

    beforeEach(async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        await sequelize.query(
            "INSERT INTO customers (account_id, full_name, phone, status, loyalty_points, created_at, updated_at) VALUES (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`Review owner ${suffix}`, `Review other ${suffix}`] },
        );
        const ownerId = (await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Review owner ${suffix}`])).id;
        const otherId = (await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Review other ${suffix}`])).id;
        owner = { accountId: "1", customerId: ownerId, employeeId: null, grants: [] };
        other = { accountId: "2", customerId: otherId, employeeId: null, grants: [] };
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, 'Review category', ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`REV_${suffix}`, `review-${suffix}`] },
        );
        const categoryId = (await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`REV_${suffix}`])).id;
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, 'Review product', ?, NULL, '100.0000', NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categoryId, `review-product-${suffix}`] },
        );
        productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`review-product-${suffix}`])).id;
    });

    afterAll(async () => { await sequelize?.close(); });

    it("stores one review per customer/product and isolates the customer ID from request data", async () => {
        const results = await Promise.all([
            service.create(owner, { productId, rating: 5, comment: "  Tốt  " }),
            service.create(owner, { productId, rating: 4, comment: "Khác" }),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["already_reviewed", "created"]);
        const persisted = await sequelize.query<{ id: string; customerId: string; rating: number; reviewText: string }>(
            "SELECT id, customer_id AS customerId, rating, review_text AS reviewText FROM reviews WHERE product_id = ?",
            { replacements: [productId], type: QueryTypes.SELECT },
        );
        expect(persisted).toHaveLength(1);
        expect(persisted[0]?.customerId).toBe(owner.customerId);
        expect(["Tốt", "Khác"]).toContain(persisted[0]?.reviewText);
        const another = await service.create(other, { productId, rating: 3, comment: "Ổn" });
        expect(another.kind).toBe("created");
        const count = await one<{ total: number }>("SELECT COUNT(*) AS total FROM reviews WHERE product_id = ?", [productId]);
        expect(Number(count.total)).toBe(2);
    });

    it("rejects a missing product without creating a review", async () => {
        await expect(service.create(owner, {
            productId: "9223372036854775807", rating: 5, comment: "Không tồn tại",
        })).resolves.toEqual({ kind: "product_not_found" });
        const count = await one<{ total: number }>("SELECT COUNT(*) AS total FROM reviews WHERE customer_id = ?", [owner.customerId]);
        expect(Number(count.total)).toBe(0);
    });
});
