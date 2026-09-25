import type { EntityId } from "../../../shared/contracts/database-scalars.js";

export type PaymentMethodV2 = {
    id: EntityId;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export interface PaymentMethodV2Repository {
    listActive: () => Promise<readonly PaymentMethodV2[]>;
}

export class PaymentMethodV2Service {
    constructor(private readonly dependencies: { repository: PaymentMethodV2Repository }) {}

    listActive(): Promise<readonly PaymentMethodV2[]> {
        return this.dependencies.repository.listActive();
    }
}
