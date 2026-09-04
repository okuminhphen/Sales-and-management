import db from "../../models/index.js";
import type {
    CreateSizeCommand,
    SizeDto,
    SizeRepository,
    UpdateSizeCommand,
} from "./size.types.js";

interface SizeRow {
    getDataValue(key: "id" | "name"): unknown;
    update(values: { name: string }): Promise<SizeRow>;
    destroy(): Promise<void>;
}

interface SizeModel {
    findAll(options: { attributes: string[] }): Promise<SizeRow[]>;
    create(values: { name: string }): Promise<SizeRow>;
    findByPk(id: number): Promise<SizeRow | null>;
}

const toDto = (row: SizeRow): SizeDto => ({
    id: Number(row.getDataValue("id")),
    name: String(row.getDataValue("name")),
});

export class SequelizeSizeRepository implements SizeRepository {
    private readonly model = db.Size as SizeModel;

    async list(): Promise<SizeDto[]> {
        const rows = await this.model.findAll({ attributes: ["id", "name"] });
        return rows.map(toDto);
    }

    async create(command: CreateSizeCommand): Promise<SizeDto> {
        return toDto(await this.model.create({ name: command.name }));
    }

    async update(command: UpdateSizeCommand): Promise<SizeDto | null> {
        const row = await this.model.findByPk(command.id);
        if (!row) return null;
        await row.update({ name: command.name });
        return toDto(row);
    }

    async delete(id: number): Promise<boolean> {
        const row = await this.model.findByPk(id);
        if (!row) return false;
        await row.destroy();
        return true;
    }
}
