import type {
    Model,
    ModelStatic,
    Sequelize,
    Transaction,
    TransactionOptions,
} from "sequelize";

export const V2_PERSISTENCE_MODULE_NAMES = [
    "identity-access",
    "catalog",
    "inventory-transfer",
    "commerce",
    "payment-fulfillment",
    "communication-ai",
    "personalization",
    "outbox",
] as const;

export type V2PersistenceModuleName = (typeof V2_PERSISTENCE_MODULE_NAMES)[number];

export type V2ModelDefinition = {
    name: string;
    model: ModelStatic<Model>;
};

export type V2ModelRegistry = {
    get: (name: string) => ModelStatic<Model>;
    names: () => readonly string[];
};

export type V2PersistenceModule = {
    name: V2PersistenceModuleName;
    models: readonly V2ModelDefinition[];
    associate?: (registry: V2ModelRegistry) => void;
};

export type V2Persistence = {
    sequelize: Sequelize;
    models: V2ModelRegistry;
    inTransaction: <Result>(
        work: (transaction: Transaction) => Promise<Result>,
        options?: TransactionOptions,
    ) => Promise<Result>;
};

const tableNamePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export const v2ModelOptions = (tableName: string) => {
    if (!tableNamePattern.test(tableName)) {
        throw new Error("Database V2 table names must use lowercase snake_case.");
    }
    return {
        tableName,
        freezeTableName: true,
        timestamps: false,
        underscored: false,
    } as const;
};

export const createV2ModelRegistry = (
    modules: readonly V2PersistenceModule[],
): V2ModelRegistry => {
    const moduleNames = new Set<string>();
    const models = new Map<string, ModelStatic<Model>>();

    for (const module of modules) {
        if (moduleNames.has(module.name)) {
            throw new Error(`Database V2 persistence module registered more than once: ${module.name}.`);
        }
        moduleNames.add(module.name);

        for (const definition of module.models) {
            if (models.has(definition.name)) {
                throw new Error(`Database V2 model registered more than once: ${definition.name}.`);
            }
            models.set(definition.name, definition.model);
        }
    }

    const registry: V2ModelRegistry = {
        get: (name) => {
            const model = models.get(name);
            if (!model) {
                throw new Error(`Database V2 model is not registered: ${name}.`);
            }
            return model;
        },
        names: () => [...models.keys()].sort((left, right) => left.localeCompare(right)),
    };

    for (const module of modules) {
        module.associate?.(registry);
    }
    return registry;
};

export const withV2Transaction = async <Result>(
    sequelize: Sequelize,
    work: (transaction: Transaction) => Promise<Result>,
    options?: TransactionOptions,
): Promise<Result> => {
    if (options) {
        return sequelize.transaction(options, async (transaction) => work(transaction));
    }
    return sequelize.transaction(async (transaction) => work(transaction));
};

export const createV2Persistence = (
    sequelize: Sequelize,
    modules: readonly V2PersistenceModule[],
): V2Persistence => ({
    sequelize,
    models: createV2ModelRegistry(modules),
    inTransaction: (work, options) => withV2Transaction(sequelize, work, options),
});
