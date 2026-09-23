import type { Model, ModelStatic, Optional } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";

export type NewEntity<Attributes extends { id: unknown }> = Optional<Attributes, "id">;
export type IdentityAccessModel<Attributes extends { id: unknown }> = ModelStatic<
    Model<Attributes, NewEntity<Attributes>>
>;

/** Typed boundary over the V2 composition registry owned by identity-access. */
export const getIdentityAccessModel = <Attributes extends { id: unknown }>(
    persistence: V2Persistence,
    name: string,
): IdentityAccessModel<Attributes> => persistence.models.get(name) as IdentityAccessModel<Attributes>;
