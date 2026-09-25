import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type { PaymentMethodV2, PaymentMethodV2Repository } from "../application/payment-method-v2.service.js";

type PaymentMethodRow = {
    id: unknown;
    code: string;
    name: string;
    description: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};

export class SequelizePaymentMethodV2Repository implements PaymentMethodV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listActive(): Promise<readonly PaymentMethodV2[]> {
        const rows = await this.persistence.sequelize.query<PaymentMethodRow>(
            `SELECT id, code, name, description, created_at AS createdAt, updated_at AS updatedAt
             FROM payment_methods WHERE is_active = TRUE ORDER BY id ASC`,
            { type: QueryTypes.SELECT },
        );
        return rows.map((row) => ({ id: serializeDatabaseEntityId(row.id), code: row.code,
            name: row.name, description: row.description, isActive: true,
            createdAt: new Date(row.createdAt).toISOString(),
            updatedAt: new Date(row.updatedAt).toISOString() }));
    }
}
