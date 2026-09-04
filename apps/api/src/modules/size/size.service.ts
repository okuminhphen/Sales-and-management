import type {
    CreateSizeCommand,
    SizeDto,
    SizeRepository,
    UpdateSizeCommand,
} from "./size.types.js";

export class SizeService {
    constructor(private readonly repository: SizeRepository) {}

    list(): Promise<SizeDto[]> {
        return this.repository.list();
    }

    create(command: CreateSizeCommand): Promise<SizeDto> {
        return this.repository.create(command);
    }

    update(command: UpdateSizeCommand): Promise<SizeDto | null> {
        return this.repository.update(command);
    }

    delete(id: number): Promise<boolean> {
        return this.repository.delete(id);
    }
}
