import { ForeignKeyConstraintError, UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { CatalogSizeCommandV2Repository, SizeCommandOutcome } from "../application/catalog-size-command-v2.service.js";
import type { SizeAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

export class SequelizeCatalogSizeCommandV2Repository implements CatalogSizeCommandV2Repository {
    private readonly size: CatalogModel<SizeAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.size = getCatalogModel<SizeAttributes>(persistence, "Size");
    }

    async create(name: string): Promise<SizeCommandOutcome> {
        try {
            const now = new Date();
            const size = await this.size.create({ name, createdAt: now, updatedAt: now });
            return { kind: "created", id: serializeDatabaseEntityId(size.dataValues.id) };
        } catch (error) {
            if (error instanceof UniqueConstraintError) return { kind: "size_name_conflict" };
            throw error;
        }
    }

    async update(id: EntityId, name: string): Promise<SizeCommandOutcome> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const size = await this.size.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
                if (!size) return { kind: "size_not_found" };
                await size.update({ name, updatedAt: new Date() }, { transaction });
                return { kind: "updated", id };
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError) return { kind: "size_name_conflict" };
            throw error;
        }
    }

    async remove(id: EntityId): Promise<SizeCommandOutcome> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const size = await this.size.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
                if (!size) return { kind: "size_not_found" };
                await size.destroy({ transaction });
                return { kind: "deleted" };
            });
        } catch (error) {
            if (error instanceof ForeignKeyConstraintError) return { kind: "size_in_use" };
            throw error;
        }
    }
}
