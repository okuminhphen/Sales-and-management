import type { QueryInterface } from "sequelize";

const ownedTables = [
    "categories",
    "products",
    "sizes",
    "product_variants",
    "reviews",
    "banners",
] as const;

const createStatements = [
    `CREATE TABLE \`categories\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`parent_id\` BIGINT NULL,
        \`code\` VARCHAR(50) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`slug\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_categories_code\` (\`code\`),
        UNIQUE KEY \`uq_categories_slug\` (\`slug\`),
        KEY \`idx_categories_parent\` (\`parent_id\`),
        CONSTRAINT \`fk_categories_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`products\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`category_id\` BIGINT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`slug\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`base_price\` DECIMAL(19,4) NOT NULL,
        \`images\` JSON NULL,
        \`status\` ENUM('draft', 'active', 'inactive') NOT NULL DEFAULT 'draft',
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_products_slug\` (\`slug\`),
        KEY \`idx_products_category\` (\`category_id\`),
        KEY \`idx_products_status_created\` (\`status\`, \`created_at\`),
        CONSTRAINT \`chk_products_base_price\` CHECK (\`base_price\` >= 0),
        CONSTRAINT \`fk_products_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`sizes\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(100) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_sizes_name\` (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`product_variants\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`product_id\` BIGINT NOT NULL,
        \`size_id\` BIGINT NOT NULL,
        \`sku\` VARCHAR(100) NOT NULL,
        \`status\` ENUM('draft', 'active', 'inactive') NOT NULL DEFAULT 'active',
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_variants_sku\` (\`sku\`),
        CONSTRAINT \`uq_product_variants_product_size\` UNIQUE (\`product_id\`, \`size_id\`),
        KEY \`idx_product_variants_size\` (\`size_id\`),
        CONSTRAINT \`fk_product_variants_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_product_variants_size\` FOREIGN KEY (\`size_id\`) REFERENCES \`sizes\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`reviews\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`customer_id\` BIGINT NOT NULL,
        \`product_id\` BIGINT NOT NULL,
        \`order_item_id\` BIGINT NULL,
        \`rating\` INT NOT NULL,
        \`review_text\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_reviews_customer_product\` UNIQUE (\`customer_id\`, \`product_id\`),
        KEY \`idx_reviews_product\` (\`product_id\`),
        KEY \`idx_reviews_order_item\` (\`order_item_id\`),
        CONSTRAINT \`chk_reviews_rating\` CHECK (\`rating\` BETWEEN 1 AND 5),
        CONSTRAINT \`fk_reviews_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_reviews_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`banners\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(255) NOT NULL,
        \`image\` JSON NULL,
        \`target_url\` VARCHAR(1000) NULL,
        \`status\` ENUM('draft', 'active', 'inactive') NOT NULL DEFAULT 'draft',
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// `order_items` belongs to the commerce baseline. T08 adds
// `fk_reviews_order_item` after that table exists; the indexed nullable column
// is deliberately created here to preserve the reviewed DBML shape.

const normalizeTableName = (tableName: string): string => tableName.toLowerCase();

const migration = {
    up: async (queryInterface: QueryInterface): Promise<void> => {
        const existingTables = new Set(
            (await queryInterface.showAllTables()).map(normalizeTableName),
        );
        const overlappingTables = ownedTables.filter((tableName) =>
            existingTables.has(tableName),
        );

        if (overlappingTables.length > 0) {
            throw new Error(
                `Database V2 catalog baseline refuses to run when any owned table already exists: ${overlappingTables.join(", ")}.`,
            );
        }

        for (const statement of createStatements) {
            await queryInterface.sequelize.query(statement);
        }
    },
};

export default migration;
