import type { Model, ModelStatic, Optional } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";

export type NewCatalogEntity<Attributes extends { id: unknown }> = Optional<Attributes, "id">;
export type CatalogModel<Attributes extends { id: unknown }> = ModelStatic<
    Model<Attributes, NewCatalogEntity<Attributes>>
>;

/** Typed boundary over models registered by the catalog persistence module. */
export const getCatalogModel = <Attributes extends { id: unknown }>(
    persistence: V2Persistence,
    name: string,
): CatalogModel<Attributes> => persistence.models.get(name) as CatalogModel<Attributes>;
