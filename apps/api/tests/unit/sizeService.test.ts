import { describe, expect, it } from "vitest";
import { SizeService } from "../../src/modules/size/size.service.js";
import type {
    CreateSizeCommand,
    SizeDto,
    SizeRepository,
    UpdateSizeCommand,
} from "../../src/modules/size/size.types.js";

class InMemorySizeRepository implements SizeRepository {
    private sizes: SizeDto[] = [{ id: 1, name: "M" }];

    async list(): Promise<SizeDto[]> {
        return [...this.sizes];
    }

    async create(command: CreateSizeCommand): Promise<SizeDto> {
        const size = { id: this.sizes.length + 1, name: command.name };
        this.sizes.push(size);
        return size;
    }

    async update(command: UpdateSizeCommand): Promise<SizeDto | null> {
        const size = this.sizes.find((candidate) => candidate.id === command.id);
        if (!size) return null;
        size.name = command.name;
        return { ...size };
    }

    async delete(id: number): Promise<boolean> {
        const originalLength = this.sizes.length;
        this.sizes = this.sizes.filter((size) => size.id !== id);
        return this.sizes.length !== originalLength;
    }
}

describe("SizeService", () => {
    it("delegates the complete lifecycle through the repository port", async () => {
        const service = new SizeService(new InMemorySizeRepository());

        expect(await service.create({ name: "L" })).toEqual({ id: 2, name: "L" });
        expect(await service.update({ id: 2, name: "XL" })).toEqual({ id: 2, name: "XL" });
        expect(await service.delete(2)).toBe(true);
        expect(await service.list()).toEqual([{ id: 1, name: "M" }]);
    });
});
