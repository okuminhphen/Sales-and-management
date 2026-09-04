export interface SizeDto {
    id: number;
    name: string;
}

export interface CreateSizeCommand {
    name: string;
}

export interface UpdateSizeCommand extends CreateSizeCommand {
    id: number;
}

export interface SizeRepository {
    list(): Promise<SizeDto[]>;
    create(command: CreateSizeCommand): Promise<SizeDto>;
    update(command: UpdateSizeCommand): Promise<SizeDto | null>;
    delete(id: number): Promise<boolean>;
}
