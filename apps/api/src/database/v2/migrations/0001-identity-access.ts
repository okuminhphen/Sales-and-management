import type { QueryInterface } from "sequelize";

const ownedTables = [
    "accounts",
    "roles",
    "permissions",
    "role_permissions",
    "account_roles",
    "customers",
    "customer_addresses",
    "branches",
    "employees",
] as const;

const createStatements = [
    `CREATE TABLE \`accounts\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`email\` VARCHAR(255) NOT NULL,
        \`username\` VARCHAR(100) NULL,
        \`password_hash\` VARCHAR(255) NULL,
        \`status\` ENUM('pending', 'active', 'locked', 'inactive') NOT NULL DEFAULT 'pending',
        \`email_verified_at\` TIMESTAMP NULL,
        \`last_login_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_accounts_email\` (\`email\`),
        UNIQUE KEY \`uq_accounts_username\` (\`username\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`roles\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(100) NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`description\` VARCHAR(500) NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_roles_code\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`permissions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(150) NOT NULL,
        \`description\` VARCHAR(500) NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_permissions_code\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`role_permissions\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`role_id\` INT NOT NULL,
        \`permission_id\` INT NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_role_permissions_role_permission\` UNIQUE (\`role_id\`, \`permission_id\`),
        KEY \`idx_role_permissions_permission\` (\`permission_id\`),
        CONSTRAINT \`fk_role_permissions_role\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_role_permissions_permission\` FOREIGN KEY (\`permission_id\`) REFERENCES \`permissions\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`account_roles\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`account_id\` BIGINT NOT NULL,
        \`role_id\` INT NOT NULL,
        \`scope_type\` ENUM('global', 'branch') NOT NULL DEFAULT 'global',
        \`scope_key\` VARCHAR(100) NOT NULL,
        \`branch_id\` BIGINT NULL,
        \`assigned_by_account_id\` BIGINT NULL,
        \`assigned_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_account_roles_account_role_scope\` UNIQUE (\`account_id\`, \`role_id\`, \`scope_key\`),
        KEY \`idx_account_roles_role\` (\`role_id\`),
        KEY \`idx_account_roles_branch_role\` (\`branch_id\`, \`role_id\`),
        KEY \`idx_account_roles_assigned_by\` (\`assigned_by_account_id\`),
        CONSTRAINT \`chk_account_role_scope\` CHECK ((\`scope_type\` = 'global' AND \`branch_id\` IS NULL AND \`scope_key\` = 'GLOBAL') OR (\`scope_type\` = 'branch' AND \`branch_id\` IS NOT NULL AND \`scope_key\` = CONCAT('BRANCH:', \`branch_id\`))),
        CONSTRAINT \`fk_account_roles_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_account_roles_role\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_account_roles_assigned_by\` FOREIGN KEY (\`assigned_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`customers\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`account_id\` BIGINT NULL,
        \`full_name\` VARCHAR(255) NULL,
        \`phone\` VARCHAR(30) NULL,
        \`status\` ENUM('active', 'inactive', 'anonymized') NOT NULL DEFAULT 'active',
        \`loyalty_points\` INT NOT NULL DEFAULT 0,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_customers_account\` (\`account_id\`),
        CONSTRAINT \`fk_customers_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`customer_addresses\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`customer_id\` BIGINT NOT NULL,
        \`recipient_name\` VARCHAR(255) NOT NULL,
        \`recipient_phone\` VARCHAR(30) NOT NULL,
        \`address_line\` VARCHAR(500) NOT NULL,
        \`province_id\` INT NULL,
        \`district_id\` INT NULL,
        \`ward_code\` VARCHAR(50) NULL,
        \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_customer_addresses_customer\` (\`customer_id\`),
        CONSTRAINT \`fk_customer_addresses_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`branches\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(50) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`address\` VARCHAR(500) NOT NULL,
        \`phone\` VARCHAR(30) NULL,
        \`email\` VARCHAR(255) NULL,
        \`type\` ENUM('central', 'branch') NOT NULL DEFAULT 'branch',
        \`manager_employee_id\` BIGINT NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_branches_code\` (\`code\`),
        KEY \`idx_branches_manager_employee\` (\`manager_employee_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`employees\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`account_id\` BIGINT NULL,
        \`branch_id\` BIGINT NOT NULL,
        \`code\` VARCHAR(50) NOT NULL,
        \`full_name\` VARCHAR(255) NOT NULL,
        \`position\` VARCHAR(150) NULL,
        \`phone\` VARCHAR(30) NULL,
        \`email\` VARCHAR(255) NULL,
        \`salary\` DECIMAL(19,4) NULL,
        \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        \`hired_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_employees_account\` (\`account_id\`),
        UNIQUE KEY \`uq_employees_code\` (\`code\`),
        KEY \`idx_employees_branch\` (\`branch_id\`),
        CONSTRAINT \`fk_employees_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_employees_branch\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `ALTER TABLE \`account_roles\`
        ADD CONSTRAINT \`fk_account_roles_branch\`
        FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\` (\`id\`)
        ON DELETE RESTRICT ON UPDATE RESTRICT`,
    `ALTER TABLE \`branches\`
        ADD CONSTRAINT \`fk_branches_manager_employee\`
        FOREIGN KEY (\`manager_employee_id\`) REFERENCES \`employees\` (\`id\`)
        ON DELETE RESTRICT ON UPDATE RESTRICT`,
];

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
                `Database V2 identity baseline refuses to run when any owned table already exists: ${overlappingTables.join(", ")}.`,
            );
        }

        for (const statement of createStatements) {
            await queryInterface.sequelize.query(statement);
        }
    },
};

export default migration;
